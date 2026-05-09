/**
 * @fileOverview WorkflowContinuityService — Sprint 6 Task 1.
 *
 * Tracks lifecycle progression per organization across scans, recommendations,
 * schedules, and notifications. Produces a WorkflowContinuity report with
 * deterministic scoring and operational state classification.
 *
 * Design principles:
 *   - Batch queries: one DB round per data domain for all orgs, N orgs in-memory
 *   - Stateless reads: no writes except OPERATIONAL_SILENCE_DETECTED emission (Refinement 6)
 *   - Replay-friendly: same inputs → same output (Refinement E)
 *   - Rolling window: 7 | 30 | 90 days (Refinement F)
 *   - Calculation metadata on every output (Refinement 2)
 *   - Continuity lineage on every output (Refinement 9)
 */

import { db } from '@/lib/db';
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from './operational-event-service';

// ── CONTINUITY_SIGNALS taxonomy (Refinement 1) ────────────────────────────────

export const CONTINUITY_SIGNALS = {
  SCAN_CADENCE_DECLINE:       'SCAN_CADENCE_DECLINE',
  RECOMMENDATION_ABANDONMENT: 'RECOMMENDATION_ABANDONMENT',
  INCREASING_FRICTION:        'INCREASING_FRICTION',
  STALE_SCHEDULES:            'STALE_SCHEDULES',
  UNRESOLVED_ASSERTIONS:      'UNRESOLVED_ASSERTIONS',
  DECLINING_VISIBILITY:       'DECLINING_VISIBILITY',
  NOTIFICATION_DISENGAGEMENT: 'NOTIFICATION_DISENGAGEMENT',
  ONBOARDING_INCOMPLETENESS:  'ONBOARDING_INCOMPLETENESS',
} as const;

export type ContinuitySignal = (typeof CONTINUITY_SIGNALS)[keyof typeof CONTINUITY_SIGNALS];

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContinuityState  = 'HEALTHY' | 'WATCHING' | 'FRAGMENTED' | 'STALLED';
export type VolatilityState  = 'STABLE' | 'FLUCTUATING' | 'UNSTABLE';
export type ConfidenceLevel  = 'LOW' | 'MEDIUM' | 'HIGH';

export interface WorkflowGap {
  workflow:        'scan' | 'recommendation' | 'schedule' | 'notification';
  lastActivityAt?: string;
  description:     string;
}

export interface WorkflowProgress {
  workflow:       'scan' | 'recommendation' | 'schedule' | 'notification';
  lastActivityAt: string;
  description:    string;
}

export interface WorkflowContinuity {
  organizationId:  string;
  continuityScore: number;         // 0–100
  continuityState: ContinuityState;
  volatilityState: VolatilityState; // Refinement 3

  stalledWorkflows:     WorkflowGap[];
  progressingWorkflows: WorkflowProgress[];

  recommendationsApplied: number;
  recommendationsIgnored: number;
  scansCompleted30d:      number;
  scheduleReliability:    number;  // 0–1
  lastMeaningfulActivityAt?: string;

  confidence: ConfidenceLevel; // Refinement 5

  // Refinement 9 — lineage
  traceReferences:          string[];
  relatedEventIds:          string[];
  sourceScanIds:            string[];
  sourceRecommendationIds:  string[];

  // Refinement 2 — calculation metadata
  calculatedAt:       string;
  windowDays:         7 | 30 | 90;
  calculationVersion: 'v1';
}

// ── Assertion event types for friction detection ───────────────────────────────

const ASSERTION_EVENT_TYPES = [
  'FREE_SCAN_PIPELINE_INCOMPLETE',
  'PUBLIC_RUNTIME_FLOW_BROKEN',
  'RANKING_PIPELINE_INCOMPLETE',
  'SYSTEM_RUNTIME_DEGRADATION',
];

// ── Interval window map (ms) ──────────────────────────────────────────────────

const INTERVAL_WINDOW_MS: Record<string, number> = {
  WEEKLY:    7  * 24 * 60 * 60 * 1000,
  BIWEEKLY:  14 * 24 * 60 * 60 * 1000,
  MONTHLY:   30 * 24 * 60 * 60 * 1000,
  QUARTERLY: 90 * 24 * 60 * 60 * 1000,
};

// ── Expected scan count per windowDays ────────────────────────────────────────

function expectedScanCount(windowDays: number): number {
  if (windowDays <= 7)  return 1;
  if (windowDays <= 30) return 2;
  return 4;
}

// ── Score mean helper ─────────────────────────────────────────────────────────

function meanScore(report: {
  accuracyScore: number;
  coverageScore: number;
  entityUnderstandingScore: number;
  consistencyScore: number;
}): number {
  return (report.accuracyScore + report.coverageScore +
          report.entityUnderstandingScore + report.consistencyScore) / 4;
}

// ── WorkflowContinuityService ─────────────────────────────────────────────────

export class WorkflowContinuityService {
  /**
   * Compute WorkflowContinuity for multiple organizations in one batch.
   * All DB queries are issued together; per-org scoring is done in-memory.
   *
   * @param orgIds    Real org IDs (sentinels excluded by caller)
   * @param orgs      Org metadata (id, createdAt) pre-loaded by caller
   * @param windowDays Rolling window for analysis (default: 30)
   */
  static async computeForOrgs(
    orgIds:    string[],
    orgs:      { id: string; createdAt: Date }[],
    windowDays: 7 | 30 | 90 = 30,
  ): Promise<WorkflowContinuity[]> {
    if (orgIds.length === 0) return [];

    const now         = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const silenceThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── Batch queries (parallel) ──────────────────────────────────────────────
    const [
      windowScans,
      last5ScansWithReports,
      schedules,
      windowNotifications,
      windowEvents,
    ] = await Promise.all([
      // Scans in rolling window
      db.perceptionScan.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:       { gte: windowStart },
          status:          { in: ['COMPLETE', 'PARTIAL'] },
        },
        select: {
          id:             true,
          organizationId: true,
          completedAt:    true,
          createdAt:      true,
        },
      }),

      // Last 5 completed scans with reports per org (for volatility)
      db.perceptionScan.findMany({
        where: {
          organizationId: { in: orgIds },
          status:         { in: ['COMPLETE', 'PARTIAL'] },
          scanReport:     { isNot: null },
        },
        select: {
          id:             true,
          organizationId: true,
          completedAt:    true,
          scanReport: {
            select: {
              accuracyScore:            true,
              coverageScore:            true,
              entityUnderstandingScore: true,
              consistencyScore:         true,
            },
          },
        },
        orderBy: { completedAt: 'desc' },
        take:    orgIds.length * 5 + 50,  // ~5 per org
      }),

      // All scan schedules
      db.scanSchedule.findMany({
        where: { organizationId: { in: orgIds } },
        select: {
          id:             true,
          organizationId: true,
          isActive:       true,
          interval:       true,
          lastRunAt:      true,
          nextRunAt:      true,
        },
      }),

      // Notifications in rolling window
      db.notification.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: windowStart },
          archivedAt:     null,
        },
        select: {
          id:             true,
          organizationId: true,
          isRead:         true,
          createdAt:      true,
        },
      }),

      // Operational events in rolling window (for lineage + friction)
      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: windowStart },
        },
        select: {
          id:             true,
          organizationId: true,
          eventType:      true,
          traceId:        true,
          createdAt:      true,
        },
      }),
    ]);

    // Fetch recommendations separately (join through perceptionScan)
    const windowScanIds = windowScans.map((s) => s.id);
    const recommendations = windowScanIds.length > 0
      ? await db.recommendation.findMany({
          where: { perceptionScanId: { in: windowScanIds } },
          select: {
            id:               true,
            perceptionScanId: true,
            status:           true,
            actionedAt:       true,
            completedAt:      true,
          },
        })
      : [];

    // Also fetch ALL org recommendations (not just window scans) for full ratio
    const allOrgScanIds = await db.perceptionScan.findMany({
      where:  { organizationId: { in: orgIds } },
      select: { id: true, organizationId: true },
    });
    const allScanIdToOrgId = new Map(allOrgScanIds.map((s) => [s.id, s.organizationId]));
    const allRecommendations = allOrgScanIds.length > 0
      ? await db.recommendation.findMany({
          where: { perceptionScanId: { in: allOrgScanIds.map((s) => s.id) } },
          select: {
            id:               true,
            perceptionScanId: true,
            status:           true,
            completedAt:      true,
            actionedAt:       true,
          },
        })
      : [];

    // ── Build lookup maps ─────────────────────────────────────────────────────

    const scansByOrg   = groupBy(windowScans, (s) => s.organizationId);
    const schedsByOrg  = groupBy(schedules,   (s) => s.organizationId);
    const notifsByOrg  = groupBy(windowNotifications, (n) => n.organizationId);
    const eventsByOrg  = groupBy(windowEvents, (e) => e.organizationId ?? '');

    // Last 5 scans per org
    const last5ByOrg: Map<string, typeof last5ScansWithReports> = new Map();
    for (const scan of last5ScansWithReports) {
      const existing = last5ByOrg.get(scan.organizationId) ?? [];
      if (existing.length < 5) {
        existing.push(scan);
        last5ByOrg.set(scan.organizationId, existing);
      }
    }

    // Recommendations per org (all-time)
    const allRecsByOrg: Map<string, typeof allRecommendations> = new Map();
    for (const rec of allRecommendations) {
      const orgId = allScanIdToOrgId.get(rec.perceptionScanId);
      if (!orgId) continue;
      const existing = allRecsByOrg.get(orgId) ?? [];
      existing.push(rec);
      allRecsByOrg.set(orgId, existing);
    }

    // Org metadata map
    const orgMeta = new Map(orgs.map((o) => [o.id, o]));

    // ── Compute per org ───────────────────────────────────────────────────────
    const results: WorkflowContinuity[] = [];
    const calculatedAt = new Date().toISOString();

    for (const orgId of orgIds) {
      const orgScans   = scansByOrg.get(orgId) ?? [];
      const orgScheds  = schedsByOrg.get(orgId) ?? [];
      const orgNotifs  = notifsByOrg.get(orgId) ?? [];
      const orgEvents  = eventsByOrg.get(orgId) ?? [];
      const orgRecords = allRecsByOrg.get(orgId) ?? [];
      const last5      = last5ByOrg.get(orgId) ?? [];
      const org        = orgMeta.get(orgId);

      // ── Scans ──────────────────────────────────────────────────────────────
      const scansCompleted30d = scansByOrg.get(orgId)?.length ?? 0;
      const expected          = expectedScanCount(windowDays);
      const scanComponent     = Math.min(25, (scansCompleted30d / expected) * 25);
      const sourceScanIds     = orgScans.map((s) => s.id);

      // ── Recommendations ────────────────────────────────────────────────────
      const totalRecs     = orgRecords.length;
      const appliedRecs   = orgRecords.filter(
        (r) => r.status === 'COMPLETED' || r.status === 'IN_PROGRESS',
      ).length;
      const ignoredRecs   = orgRecords.filter(
        (r) => r.status === 'OPEN' || r.status === 'DISMISSED',
      ).length;
      const sourceRecIds  = orgRecords.map((r) => r.id);

      const recComponent = totalRecs === 0
        ? 15  // neutral — no recs to act on
        : Math.min(25, (appliedRecs / totalRecs) * 25);

      // ── Schedules ──────────────────────────────────────────────────────────
      const activeScheds   = orgScheds.filter((s) => s.isActive);
      let schedReliability = 0.5; // neutral default when no schedules
      if (activeScheds.length > 0) {
        const reliableCount = activeScheds.filter((s) => {
          if (!s.lastRunAt) return false;
          const windowMs = INTERVAL_WINDOW_MS[s.interval] ?? INTERVAL_WINDOW_MS.MONTHLY;
          return (now.getTime() - s.lastRunAt.getTime()) <= windowMs;
        }).length;
        schedReliability = reliableCount / activeScheds.length;
      }
      const schedComponent = schedReliability * 25;

      // ── Notifications ──────────────────────────────────────────────────────
      const totalNotifs   = orgNotifs.length;
      const readRate      = totalNotifs === 0 ? 0.6 : // neutral
        orgNotifs.filter((n) => n.isRead).length / totalNotifs;
      const notifComponent = readRate * 25;

      // ── Continuity score ───────────────────────────────────────────────────
      const continuityScore = Math.round(
        scanComponent + recComponent + schedComponent + notifComponent,
      );

      const continuityState: ContinuityState =
        continuityScore >= 70 ? 'HEALTHY'   :
        continuityScore >= 45 ? 'WATCHING'  :
        continuityScore >= 20 ? 'FRAGMENTED':
        'STALLED';

      // ── Volatility (Refinement 3) ──────────────────────────────────────────
      const volatilityState = deriveVolatility(last5);

      // ── Confidence (Refinement 5) ──────────────────────────────────────────
      const totalEvents = orgEvents.length;
      const confidence: ConfidenceLevel =
        (scansCompleted30d >= 2 && totalEvents >= 10 && activeScheds.length > 0) ? 'HIGH' :
        (scansCompleted30d >= 1 && totalEvents >= 5)                             ? 'MEDIUM' :
        'LOW';

      // ── Stalled/progressing workflows ─────────────────────────────────────
      const stalledWorkflows:     WorkflowGap[]      = [];
      const progressingWorkflows: WorkflowProgress[] = [];

      const lastScanAt = orgScans.length > 0
        ? orgScans.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].completedAt
        : null;

      if (orgScans.length === 0 && org && (now.getTime() - org.createdAt.getTime()) > 7 * 24 * 60 * 60 * 1000) {
        stalledWorkflows.push({ workflow: 'scan', description: 'No completed scans in the current window.' });
      } else if (orgScans.length > 0) {
        progressingWorkflows.push({
          workflow: 'scan',
          lastActivityAt: lastScanAt?.toISOString() ?? new Date().toISOString(),
          description: `${orgScans.length} scan(s) completed in window.`,
        });
      }

      if (totalRecs > 0 && appliedRecs === 0) {
        stalledWorkflows.push({ workflow: 'recommendation', description: `${ignoredRecs} recommendation(s) unactioned.` });
      } else if (appliedRecs > 0) {
        const lastActioned = orgRecords
          .filter((r) => r.actionedAt || r.completedAt)
          .sort((a, b) => {
            const aT = (a.actionedAt ?? a.completedAt)?.getTime() ?? 0;
            const bT = (b.actionedAt ?? b.completedAt)?.getTime() ?? 0;
            return bT - aT;
          })[0];
        progressingWorkflows.push({
          workflow: 'recommendation',
          lastActivityAt: (lastActioned?.actionedAt ?? lastActioned?.completedAt ?? new Date()).toISOString(),
          description: `${appliedRecs} recommendation(s) actioned.`,
        });
      }

      if (activeScheds.length === 0) {
        stalledWorkflows.push({ workflow: 'schedule', description: 'No active scan schedules configured.' });
      } else if (schedReliability > 0.5) {
        const lastRun = activeScheds
          .filter((s) => s.lastRunAt)
          .sort((a, b) => (b.lastRunAt?.getTime() ?? 0) - (a.lastRunAt?.getTime() ?? 0))[0];
        progressingWorkflows.push({
          workflow: 'schedule',
          lastActivityAt: lastRun?.lastRunAt?.toISOString() ?? new Date().toISOString(),
          description: `${activeScheds.length} active schedule(s), ${Math.round(schedReliability * 100)}% reliable.`,
        });
      }

      if (totalNotifs > 0 && readRate < 0.2) {
        stalledWorkflows.push({ workflow: 'notification', description: `${Math.round((1 - readRate) * 100)}% of notifications unread.` });
      } else if (totalNotifs > 0 && readRate >= 0.5) {
        const lastNotif = orgNotifs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        progressingWorkflows.push({
          workflow: 'notification',
          lastActivityAt: lastNotif.createdAt.toISOString(),
          description: `${Math.round(readRate * 100)}% notification engagement rate.`,
        });
      }

      // ── Last meaningful activity ───────────────────────────────────────────
      const activityTimestamps: number[] = [
        ...(lastScanAt ? [lastScanAt.getTime()] : []),
        ...(orgRecords.filter((r) => r.actionedAt).map((r) => r.actionedAt!.getTime())),
        ...(orgNotifs.filter((n) => n.isRead).map((n) => n.createdAt.getTime())),
        ...(orgEvents.map((e) => e.createdAt.getTime())),
      ];
      const lastMeaningfulActivityAt = activityTimestamps.length > 0
        ? new Date(Math.max(...activityTimestamps)).toISOString()
        : undefined;

      // ── Lineage (Refinement 9) ─────────────────────────────────────────────
      const traceReferences = [...new Set(orgEvents.map((e) => e.traceId))].slice(0, 20);
      const relatedEventIds = orgEvents.map((e) => e.id).slice(0, 20);

      // ── Operational silence detection (Refinement 6) ──────────────────────
      const orgAgeMs  = org ? now.getTime() - org.createdAt.getTime() : 0;
      const isOldEnough = orgAgeMs > 30 * 24 * 60 * 60 * 1000;
      const isSilent    = isOldEnough
        && orgScans.length === 0
        && orgEvents.length === 0
        && totalNotifs === 0;

      if (isSilent) {
        await WorkflowContinuityService._emitSilence(orgId);
      }

      results.push({
        organizationId:          orgId,
        continuityScore,
        continuityState,
        volatilityState,
        stalledWorkflows,
        progressingWorkflows,
        recommendationsApplied:  appliedRecs,
        recommendationsIgnored:  ignoredRecs,
        scansCompleted30d,
        scheduleReliability: schedReliability,
        lastMeaningfulActivityAt,
        confidence,
        traceReferences,
        relatedEventIds,
        sourceScanIds,
        sourceRecommendationIds: sourceRecIds.slice(0, 20),
        calculatedAt,
        windowDays,
        calculationVersion:      'v1',
      });
    }

    return results;
  }

  // ── Operational silence emission with 24h cooldown ────────────────────────

  private static async _emitSilence(orgId: string): Promise<void> {
    try {
      const cooldownSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await db.operationalEvent.findFirst({
        where: {
          organizationId: orgId,
          eventType:      EVENT_TYPES.OPERATIONAL_SILENCE_DETECTED,
          createdAt:      { gte: cooldownSince },
        },
        select: { id: true },
      });
      if (recent) return; // cooled down

      void OperationalEventService.emit({
        eventType:      EVENT_TYPES.OPERATIONAL_SILENCE_DETECTED,
        severity:       SEVERITIES.WARNING,
        source:         EVENT_SOURCES.SYSTEM_INTERNAL,
        traceId:        crypto.randomUUID(),
        organizationId: orgId,
        entityType:     'org',
        entityId:       orgId,
        message:        `Operational silence detected — no scans, events, or notifications in 30 days`,
        metadata:       { silenceWindowDays: 30 },
      });
    } catch {
      // Non-fatal
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const existing = map.get(k) ?? [];
    existing.push(item);
    map.set(k, existing);
  }
  return map;
}

function deriveVolatility(
  last5: { scanReport: { accuracyScore: number; coverageScore: number; entityUnderstandingScore: number; consistencyScore: number } | null }[],
): VolatilityState {
  const reports = last5.filter((s) => s.scanReport !== null);
  if (reports.length < 2) return 'STABLE'; // insufficient data = assume stable

  const scores = reports.map((s) => meanScore(s.scanReport!));
  const spread = Math.max(...scores) - Math.min(...scores);

  if (spread <= 10) return 'STABLE';
  if (spread <= 25) return 'FLUCTUATING';
  return 'UNSTABLE';
}
