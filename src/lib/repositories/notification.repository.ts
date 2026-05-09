/**
 * @fileOverview Notification repository.
 * All Prisma queries for the notifications table.
 *
 * Design principles:
 *  - Default queries exclude archived notifications
 *  - Unread CRITICAL notifications are never archived automatically
 *  - Priority ordering: unread CRITICAL → WARNING → SUCCESS → INFO → read → archived
 *  - Application-level sort (50 records max — negligible overhead)
 *  - Dedup helpers centralized here
 */

import { db } from "@/lib/db";
import type { Notification, NotificationType, NotificationSeverity } from "@prisma/client";

export type CreateNotificationInput = {
  organizationId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  relatedScanId?: string;
  relatedRecommendationId?: string;
  groupKey?: string;
};

// ── Priority ordering ─────────────────────────────────────────────────────────
// Lower weight = shown first

const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUCCESS: 2,
  INFO: 3,
};

/**
 * Sort notifications by operational priority:
 * 1. Unread CRITICAL
 * 2. Unread WARNING
 * 3. Unread SUCCESS
 * 4. Unread INFO
 * 5. Read (newest first)
 * 6. Archived (excluded from default fetch — only returned when explicitly requested)
 */
function prioritySort(a: Notification, b: Notification): number {
  // Archived always last
  const aArchived = a.archivedAt !== null;
  const bArchived = b.archivedAt !== null;
  if (aArchived !== bArchived) return aArchived ? 1 : -1;

  // Unread before read
  if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;

  // Within unread group: sort by severity weight
  if (!a.isRead && !b.isRead) {
    const diff =
      (SEVERITY_WEIGHT[a.severity] ?? 3) - (SEVERITY_WEIGHT[b.severity] ?? 3);
    if (diff !== 0) return diff;
  }

  // Within same read/severity: newest first
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

// ── Repository ────────────────────────────────────────────────────────────────

export const NotificationRepository = {
  async create(input: CreateNotificationInput): Promise<Notification> {
    return db.notification.create({ data: input });
  },

  /**
   * Check if a notification of this type already exists within the cooldown window.
   * Used to prevent duplicate operational notifications.
   *
   * @param cooldownMs — milliseconds. Pass Infinity for one-time-ever checks.
   */
  async existsWithinCooldown(
    organizationId: string,
    type: NotificationType,
    cooldownMs: number,
    relatedScanId?: string,
  ): Promise<boolean> {
    const since = Number.isFinite(cooldownMs)
      ? new Date(Date.now() - cooldownMs)
      : new Date(0);

    const existing = await db.notification.findFirst({
      where: {
        organizationId,
        type,
        createdAt: { gte: since },
        ...(relatedScanId ? { relatedScanId } : {}),
      },
      select: { id: true },
    });

    return existing !== null;
  },

  /**
   * List active notifications for an org, sorted by operational priority.
   * Excludes archived by default. Max 50.
   *
   * @param unreadOnly — if true, only return unread notifications
   */
  async findByOrg(
    organizationId: string,
    options?: { unreadOnly?: boolean },
  ): Promise<Notification[]> {
    const rows = await db.notification.findMany({
      where: {
        organizationId,
        archivedAt: null, // exclude archived from default view
        ...(options?.unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" }, // DB pre-sort, then in-memory priority sort
      take: 50,
    });

    return rows.sort(prioritySort);
  },

  /**
   * Count unread active (non-archived) notifications.
   */
  async countUnread(organizationId: string): Promise<number> {
    return db.notification.count({
      where: { organizationId, isRead: false, archivedAt: null },
    });
  },

  /**
   * Count unread CRITICAL notifications specifically.
   * Used by the notification bell to escalate badge color.
   */
  async countCriticalUnread(organizationId: string): Promise<number> {
    return db.notification.count({
      where: {
        organizationId,
        isRead: false,
        archivedAt: null,
        severity: "CRITICAL",
      },
    });
  },

  async markRead(id: string): Promise<void> {
    await db.notification.update({
      where: { id },
      data: { isRead: true },
    });
  },

  async markAllRead(organizationId: string): Promise<void> {
    await db.notification.updateMany({
      where: { organizationId, isRead: false, archivedAt: null },
      data: { isRead: true },
    });
  },

  /**
   * Archive notifications older than 90 days.
   *
   * Archive rule:
   *  - createdAt < 90 days ago
   *  - NOT (isRead = false AND severity = CRITICAL)
   *    → Unread CRITICAL events bypass archival regardless of age
   *
   * Called by the notification cleanup cron and lazily by GET /api/notifications.
   * Returns count of archived notifications.
   */
  async archiveOld(organizationId: string): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const result = await db.notification.updateMany({
      where: {
        organizationId,
        archivedAt: null, // not already archived
        createdAt: { lt: cutoff },
        // Bypass rule: unread CRITICAL are excluded from archival
        NOT: {
          AND: [{ isRead: false }, { severity: "CRITICAL" }],
        },
      },
      data: { archivedAt: now },
    });

    return result.count;
  },

  /**
   * Archive all organizations' old notifications.
   * Used by the notification cleanup cron to run org-wide.
   * Returns total count archived.
   */
  async archiveOldAll(): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const result = await db.notification.updateMany({
      where: {
        archivedAt: null,
        createdAt: { lt: cutoff },
        NOT: {
          AND: [{ isRead: false }, { severity: "CRITICAL" }],
        },
      },
      data: { archivedAt: now },
    });

    return result.count;
  },
};
