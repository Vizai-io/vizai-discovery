/**
 * @fileOverview OperationalHealthService (Phase 2.1)
 *
 * Deterministic, read-only health inspection for an organization.
 * Used by the ADMIN-only health API to surface operational issues.
 *
 * This is an inspection tool, NOT an observability dashboard. It
 * answers five operational questions and nothing more:
 *
 *  1. Stuck scans    — RUNNING scans older than 30 minutes
 *  2. Failed scans   — FAILED or TIMEOUT scans in the last 24 hours
 *  3. Overdue sched  — active scan schedules whose nextRunAt is in the past
 *  4. Billing        — unread CRITICAL billing notifications
 *  5. Notif backlog  — unread notification count above threshold
 *
 * Health status:
 *  - "healthy"   — no issues detected
 *  - "degraded"  — one or more medium-severity issues (overdue sched, notif backlog)
 *  - "critical"  — stuck scans, recent failures, or billing issues
 *
 * Rules:
 *  - NO LLM — all strings are static
 *  - NO writes — read-only
 *  - Stateless — derived fresh from DB each call
 *  - Deterministic — same DB state always produces same output
 */

import { db } from "@/lib/db";

export type HealthStatus = "healthy" | "degraded" | "critical";

export type HealthIssue = {
  area: string;
  status: HealthStatus;
  detail: string;
};

export type OrgHealthReport = {
  organizationId: string;
  status: HealthStatus;
  checkedAt: string;
  issues: HealthIssue[];
};

const STUCK_SCAN_MINUTES = 30;
const STUCK_SCAN_MS = STUCK_SCAN_MINUTES * 60 * 1000;
const FAILED_SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;
const NOTIF_BACKLOG_THRESHOLD = 10;

export const OperationalHealthService = {
  async getReport(organizationId: string): Promise<OrgHealthReport> {
    const now = new Date();
    const cutoffStuck = new Date(now.getTime() - STUCK_SCAN_MS);
    const cutoffFailed = new Date(now.getTime() - FAILED_SCAN_WINDOW_MS);

    const [
      stuckScanCount,
      recentFailureCount,
      overdueScheduleCount,
      criticalBillingCount,
      unreadNotifCount,
    ] = await Promise.all([
      // 1. Stuck scans — RUNNING with updatedAt older than 30 min
      db.perceptionScan.count({
        where: {
          organizationId,
          status: "RUNNING",
          updatedAt: { lt: cutoffStuck },
        },
      }),

      // 2. Failed or timed-out scans in the last 24h
      db.perceptionScan.count({
        where: {
          organizationId,
          status: { in: ["FAILED", "TIMEOUT"] },
          updatedAt: { gte: cutoffFailed },
        },
      }),

      // 3. Active schedules whose nextRunAt is overdue
      db.scanSchedule.count({
        where: {
          organizationId,
          isActive: true,
          nextRunAt: { lt: now },
        },
      }),

      // 4. Unread CRITICAL billing notifications
      db.notification.count({
        where: {
          organizationId,
          isRead: false,
          severity: "CRITICAL",
          type: { in: ["BILLING_PAYMENT_FAILED", "BILLING_WARNING"] },
          archivedAt: null,
        },
      }),

      // 5. Total unread notification count
      db.notification.count({
        where: {
          organizationId,
          isRead: false,
          archivedAt: null,
        },
      }),
    ]);

    const issues: HealthIssue[] = [];

    if (stuckScanCount > 0) {
      issues.push({
        area: "scan_execution",
        status: "critical",
        detail: `${stuckScanCount} scan${stuckScanCount > 1 ? "s have" : " has"} been running for over ${STUCK_SCAN_MINUTES} minutes and may be stuck.`,
      });
    }

    if (recentFailureCount > 0) {
      issues.push({
        area: "scan_failures",
        status: "critical",
        detail: `${recentFailureCount} scan${recentFailureCount > 1 ? "s" : ""} failed or timed out in the last 24 hours.`,
      });
    }

    if (criticalBillingCount > 0) {
      issues.push({
        area: "billing",
        status: "critical",
        detail: `${criticalBillingCount} unresolved critical billing notification${criticalBillingCount > 1 ? "s" : ""} require attention.`,
      });
    }

    if (overdueScheduleCount > 0) {
      issues.push({
        area: "scan_schedule",
        status: "degraded",
        detail: `${overdueScheduleCount} active scan schedule${overdueScheduleCount > 1 ? "s are" : " is"} overdue.`,
      });
    }

    if (unreadNotifCount >= NOTIF_BACKLOG_THRESHOLD) {
      issues.push({
        area: "notification_backlog",
        status: "degraded",
        detail: `${unreadNotifCount} unread notifications. Review your notification inbox.`,
      });
    }

    const overallStatus: HealthStatus = issues.some((i) => i.status === "critical")
      ? "critical"
      : issues.some((i) => i.status === "degraded")
        ? "degraded"
        : "healthy";

    return {
      organizationId,
      status: overallStatus,
      checkedAt: now.toISOString(),
      issues,
    };
  },
} as const;
