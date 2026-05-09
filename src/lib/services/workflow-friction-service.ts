/**
 * @fileOverview WorkflowFrictionService — Sprint 5 Task 4.
 *
 * Detects workflow friction: bottlenecks in the lifecycle that indicate a user
 * or platform process is stalled, repeatedly failing, or silently broken.
 *
 * All detections are pure Postgres queries — no side effects, no writes.
 * Results are consumed by /api/admin/operations and the Operations dashboard.
 *
 * Refinement 5: FrictionCategory type — each detection has a category label
 * for grouping and filtering in the UI.
 *
 * Friction categories:
 *   PROVISIONING  — user lifecycle bottlenecks
 *   SCAN          — scan execution failures / stalls
 *   RECOMMENDATION — recommendation backlog / ignored items
 *   NOTIFICATION   — stale or undelivered notifications
 *   RANKING        — ranking pipeline health
 *   ASSERTION      — repeated integrity assertion failures
 */

import { db } from '@/lib/db';

// ── FrictionCategory (Refinement 5) ──────────────────────────────────────────

export type FrictionCategory =
  | 'PROVISIONING'
  | 'SCAN'
  | 'RECOMMENDATION'
  | 'NOTIFICATION'
  | 'RANKING'
  | 'ASSERTION';

export type FrictionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FrictionSignal {
  category:    FrictionCategory;
  severity:    FrictionSeverity;
  title:       string;
  description: string;
  count:       number;
  /** Entity IDs affected, for drill-down. Max 10. */
  sampleIds?:  string[];
}

export interface WorkflowFrictionReport {
  generatedAt:   string;
  windowMinutes: number;
  signals:       FrictionSignal[];
  /** Total friction signals detected. 0 = no friction. */
  totalSignals:  number;
  /** Highest severity found (or null if no signals). */
  maxSeverity:   FrictionSeverity | null;
}

// ── WorkflowFrictionService ───────────────────────────────────────────────────

export class WorkflowFrictionService {
  /**
   * Runs all friction detections and returns a consolidated report.
   * Uses a rolling window of `windowMinutes` for time-bounded checks.
   *
   * Never throws — each detection is individually guarded. A failed detection
   * is omitted from results with a console.error log.
   */
  static async detectFriction(windowMinutes: number = 60): Promise<WorkflowFrictionReport> {
    const since   = new Date(Date.now() - windowMinutes * 60 * 1000);
    const signals: FrictionSignal[] = [];

    // Run all detections in parallel — each returns a signal or null
    const results = await Promise.allSettled([
      WorkflowFrictionService._detectOnboardingAbandonment(since),
      WorkflowFrictionService._detectStuckScans(),
      WorkflowFrictionService._detectFailedScanStreak(since),
      WorkflowFrictionService._detectIgnoredRecommendations(),
      WorkflowFrictionService._detectStaleNotifications(),
      WorkflowFrictionService._detectRepeatedAssertions(since),
    ]);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        signals.push(result.value);
      } else if (result.status === 'rejected') {
        console.error('[WorkflowFrictionService] Detection failed (non-fatal)', {
          error: result.reason?.message,
        });
      }
    }

    // Severity ordering for max derivation
    const severityOrder: FrictionSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const maxSeverity = signals.length === 0
      ? null
      : signals.reduce<FrictionSeverity>((max, s) => {
          return severityOrder.indexOf(s.severity) > severityOrder.indexOf(max)
            ? s.severity
            : max;
        }, 'LOW');

    return {
      generatedAt:   new Date().toISOString(),
      windowMinutes,
      signals,
      totalSignals:  signals.length,
      maxSeverity,
    };
  }

  // ── Onboarding abandonment ──────────────────────────────────────────────────
  // Users who completed sign-up (appear in Postgres with organizationId = 'unassigned')
  // but have not completed onboarding (still unassigned after >30 min).

  private static async _detectOnboardingAbandonment(since: Date): Promise<FrictionSignal | null> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const stalled = await db.user.findMany({
      where: {
        organizationId: 'unassigned',
        createdAt:      { lt: thirtyMinutesAgo },
      },
      select: { id: true },
      take: 100,
    });

    if (stalled.length === 0) return null;

    const severity: FrictionSeverity =
      stalled.length >= 10 ? 'HIGH' :
      stalled.length >= 3  ? 'MEDIUM' : 'LOW';

    return {
      category:    'PROVISIONING',
      severity,
      title:       'Onboarding Abandoned',
      description: `${stalled.length} user(s) signed up more than 30 minutes ago but have not completed onboarding (still in "unassigned" org).`,
      count:       stalled.length,
      sampleIds:   stalled.slice(0, 10).map((u) => u.id),
    };
  }

  // ── Stuck scans ─────────────────────────────────────────────────────────────
  // Scans that have been in PENDING or RUNNING state for >10 minutes.
  // Indicates a hung scan engine or a server timeout without status update.

  private static async _detectStuckScans(): Promise<FrictionSignal | null> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const stuck = await db.perceptionScan.findMany({
      where: {
        status:    { in: ['PENDING', 'RUNNING'] },
        startedAt: { lt: tenMinutesAgo },
      },
      select: { id: true, organizationId: true, status: true },
      take: 50,
    });

    if (stuck.length === 0) return null;

    const severity: FrictionSeverity =
      stuck.length >= 5 ? 'CRITICAL' :
      stuck.length >= 2 ? 'HIGH' : 'MEDIUM';

    return {
      category:    'SCAN',
      severity,
      title:       'Stuck Scans',
      description: `${stuck.length} scan(s) have been PENDING or RUNNING for more than 10 minutes. Likely a server timeout or engine hang without status update.`,
      count:       stuck.length,
      sampleIds:   stuck.slice(0, 10).map((s) => s.id),
    };
  }

  // ── Failed scan streak ──────────────────────────────────────────────────────
  // Multiple FAILED scans in the rolling window — indicates a systemic engine issue.

  private static async _detectFailedScanStreak(since: Date): Promise<FrictionSignal | null> {
    const failed = await db.perceptionScan.findMany({
      where: {
        status:    'FAILED',
        createdAt: { gte: since },
      },
      select: { id: true, organizationId: true },
      take: 50,
    });

    // A single failure is noise; ≥3 in the window is a streak
    if (failed.length < 3) return null;

    const severity: FrictionSeverity =
      failed.length >= 10 ? 'CRITICAL' :
      failed.length >= 5  ? 'HIGH' : 'MEDIUM';

    return {
      category:    'SCAN',
      severity,
      title:       'Failed Scan Streak',
      description: `${failed.length} scans failed in the last ${since ? 'hour' : 'window'}. This may indicate a systemic engine, model, or persistence issue.`,
      count:       failed.length,
      sampleIds:   failed.slice(0, 10).map((s) => s.id),
    };
  }

  // ── Ignored recommendations ─────────────────────────────────────────────────
  // Recommendations that have been OPEN for a long time without any status change.
  // A growing backlog indicates users are not actioning the platform's outputs.

  private static async _detectIgnoredRecommendations(): Promise<FrictionSignal | null> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const ignored = await db.recommendation.findMany({
      where: {
        status:    'OPEN',
        createdAt: { lt: sevenDaysAgo },
      },
      select: { id: true, perceptionScanId: true },
      take: 100,
    });

    if (ignored.length < 5) return null; // small backlogs are normal

    const severity: FrictionSeverity =
      ignored.length >= 50 ? 'HIGH' :
      ignored.length >= 20 ? 'MEDIUM' : 'LOW';

    return {
      category:    'RECOMMENDATION',
      severity,
      title:       'Recommendation Backlog Growing',
      description: `${ignored.length} recommendations have been OPEN for more than 7 days without being actioned. Users may not be engaging with platform outputs.`,
      count:       ignored.length,
      sampleIds:   ignored.slice(0, 10).map((r) => r.id),
    };
  }

  // ── Stale notifications ─────────────────────────────────────────────────────
  // Unread notifications older than 24 hours — may indicate delivery issues
  // or users not engaging with the notification surface.

  private static async _detectStaleNotifications(): Promise<FrictionSignal | null> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stale = await db.notification.findMany({
      where: {
        isRead:    false,
        createdAt: { lt: twentyFourHoursAgo },
      },
      select: { id: true, organizationId: true },
      take: 100,
    });

    if (stale.length < 5) return null;

    const severity: FrictionSeverity =
      stale.length >= 50 ? 'MEDIUM' :
      stale.length >= 20 ? 'LOW' : 'LOW';

    return {
      category:    'NOTIFICATION',
      severity,
      title:       'Stale Unread Notifications',
      description: `${stale.length} notifications have been unread for more than 24 hours. This may indicate notification delivery issues or low platform engagement.`,
      count:       stale.length,
      sampleIds:   stale.slice(0, 10).map((n) => n.id),
    };
  }

  // ── Repeated assertions ─────────────────────────────────────────────────────
  // Detects assertion-type events firing repeatedly in the operational event log.
  // These are early-warning signals that a pipeline segment is persistently broken.

  private static async _detectRepeatedAssertions(since: Date): Promise<FrictionSignal | null> {
    const ASSERTION_TYPES = [
      'FREE_SCAN_PIPELINE_INCOMPLETE',
      'PUBLIC_RUNTIME_FLOW_BROKEN',
      'RANKING_PIPELINE_INCOMPLETE',
      'SYSTEM_RUNTIME_DEGRADATION',
    ];

    const assertions = await db.operationalEvent.findMany({
      where: {
        eventType:  { in: ASSERTION_TYPES },
        createdAt:  { gte: since },
      },
      select: { id: true, eventType: true },
      take: 100,
    });

    if (assertions.length < 2) return null;

    const severity: FrictionSeverity =
      assertions.length >= 10 ? 'CRITICAL' :
      assertions.length >= 5  ? 'HIGH' :
      assertions.length >= 2  ? 'MEDIUM' : 'LOW';

    // Count by type for description
    const byType: Record<string, number> = {};
    for (const a of assertions) {
      byType[a.eventType] = (byType[a.eventType] ?? 0) + 1;
    }
    const breakdown = Object.entries(byType)
      .map(([t, c]) => `${t}: ${c}`)
      .join(', ');

    return {
      category:    'ASSERTION',
      severity,
      title:       'Repeated Pipeline Assertions',
      description: `${assertions.length} assertion event(s) fired in the last hour. Breakdown: ${breakdown}. Persistent assertions may indicate a broken pipeline segment requiring immediate investigation.`,
      count:       assertions.length,
      sampleIds:   assertions.slice(0, 10).map((a) => a.id),
    };
  }
}
