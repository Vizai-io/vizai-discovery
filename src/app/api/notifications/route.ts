/**
 * @fileOverview /api/notifications
 *
 * GET  — List active (non-archived) notifications for the org.
 *         Returns priority-sorted results (unread CRITICAL first).
 *         Triggers background archival of old notifications (90-day rule).
 *         Supports ?unreadOnly=true
 *
 *         Response includes:
 *           notifications[]     — priority-sorted, archived excluded
 *           unread_count        — unread active count
 *           critical_unread_count — unread CRITICAL active count (for badge escalation)
 *
 * PATCH — Mark ALL active notifications as read for the org.
 *
 * Authentication required. All results are org-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { NotificationRepository } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ notifications: [], unread_count: 0, critical_unread_count: 0 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    // Fire-and-forget archival — never blocks the response
    void NotificationRepository.archiveOld(auth.organizationId).catch(() => {});

    const [notifications, unreadCount, criticalUnreadCount] = await Promise.all([
      NotificationRepository.findByOrg(auth.organizationId, { unreadOnly }),
      NotificationRepository.countUnread(auth.organizationId),
      NotificationRepository.countCriticalUnread(auth.organizationId),
    ]);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        severity: n.severity,
        title: n.title,
        message: n.message,
        is_read: n.isRead,
        group_key: n.groupKey,
        related_scan_id: n.relatedScanId,
        related_recommendation_id: n.relatedRecommendationId,
        created_at: n.createdAt,
        archived_at: n.archivedAt,
      })),
      unread_count: unreadCount,
      critical_unread_count: criticalUnreadCount,
    });
  } catch (err: any) {
    console.error("Error listing notifications:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list notifications" },
      { status: 500 },
    );
  }
}

export async function PATCH(_request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ ok: true });
    }

    await NotificationRepository.markAllRead(auth.organizationId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error marking notifications read:", err);
    return NextResponse.json(
      { error: err.message || "Failed to mark notifications read" },
      { status: 500 },
    );
  }
}
