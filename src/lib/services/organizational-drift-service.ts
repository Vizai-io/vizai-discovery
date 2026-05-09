/**
 * @fileOverview OrganizationalDriftService — Sprint 6 Task 3.
 *
 * Detects operational degradation before collapse. Scores 8 drift signals
 * per organization, derives a drift state, and recommends interventions.
 *
 * Refinements:
 *   B:  Emit ORGANIZATIONAL_CONTINUITY_RISK (CRITICAL) when DEGRADING + oldest error >7d
 *   10: 24-hour cooldown per org (via OperationalEvent lookup)
 *   1:  Uses CONTINUITY_SIGNALS taxonomy
 *   2:  calculatedAt, windowDays, calculationVersion
 *   5:  confidence
 *   9:  traceReferences, relatedEventIds, sourceScanIds, sourceRecommendationIds
 *   E:  stateless reads (except Refinement B emission)
 *   F:  windowDays parameter
 */

import { db } from '@/lib/db';
import { CONTINUITY_SIGNALS } from './workflow-continuity-service';
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from './operational-event-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DriftState      = 'STABLE' | 'DRIFTING' | 'DEGRADING' | 'CRITICAL';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DriftSignal {
  signal:      string;         // from CONTINUITY_SIGNALS
  score:       number;         // 0–12.5
  description: string;
}

export interface OrganizationalDrift {
  organizationId:           string;
  driftScore:               number;     // 0–100
  driftState:               DriftState;
  contributingSignals:      DriftSignal[];
  recommendedInterventions: string[];
  confidence:               ConfidenceLevel; // Refinement 5

  // Refinement 9 — lineage
  traceReferences:          string[];
  relatedEventIds:          string[];
  sourceScanIds:            string[];
  sourceRecommendationIds:  string[];

  // Refinement 2
  calculatedAt:       string;
  windowDays:         7 | 30 | 90;
  calculationVersion: 'v1';
}

// ── Assertion event types ─────────────────────────────────────────────────────

const ASSERTION_TYPES = [
  'FREE_SCAN_PIPELINE_INCOMPLETE',
  'PUBLIC_RUNTIME_FLOW_BROKEN',
  'RANKING_PIPELINE_INCOMPLETE',
  'SYSTEM_RUNTIME_DEGRADATION',
  'ORGANIZATIONAL_CONTINUITY_RISK',
];

// ── Score helpers ─────────────────────────────────────────────────────────────

function meanScore(r: {
  accuracyScore: number;
  coverageScore: number;
  entityUnderstandingScore: number;
  consistencyScore: number;
}): number {
  return (r.accuracyScore + r.coverageScore +
          r.entityUnderstandingScore + r.consistencyScore) / 4;
}

function proportional(value: number, max: number, threshold: number): number {
  if (value >= threshold) return max;
  return (value / threshold) * max;
}

// ── OrganizationalDriftService ────────────────────────────────────────────────

export class OrganizationalDriftService {
  /**
   * Detect drift for multiple organizations.
   * All DB queries are batched; per-org scoring is in-memory.
   */
  static async detectForOrgs(
    orgIds:    string[],
    orgs:      { id: string; createdAt: Date }[],
    windowDays: 7 | 30 | 90 = 30,
  ): Promise<OrganizationalDrift[]> {
    if (orgIds.length === 0) return [];

    const now         = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const ago30d      = new Date(now.getTime() - 30  * 24 * 60 * 60 * 1000);
    const ago60d      = new Date(now.getTime() - 60  * 24 * 60 * 60 * 1000);
    const ago7d       = new Date(now.getTime() - 7   * 24 * 60 * 60 * 1000);
    const ago14d      = new Date(now.getTime() - 14  * 24 * 60 * 60 * 1000);

    // ── Batch queries ─────────────────────────────────────────────────────────
    const [
      recentScans,        // last 30d
      olderScans,         // 31–60d
      allScansWithReports,// last 3 per org for visibility trend
      allSchedules,
      allRecommendations,
      recentNotifications,// last 14d
      recentAssertions,   // last 30d assertion events
      recent7dEvents,     // last 7d assertion events (for friction increase)
      prior7dEvents,      // 8–14d assertion events
    ] = await Promise.all([
      // Scans 0–30d
      db.perceptionScan.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: ago30d },
          status:         { in: ['COMPLETE', 'PARTIAL'] },
        },
        select: { id: true, organizationId: true, createdAt: true },
      }),

      // Scans 31–60d
      db.perceptionScan.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: ago60d, lt: ago30d },
          status:         { in: ['COMPLETE', 'PARTIAL'] },
        },
        select: { id: true, organizationId: true, createdAt: true },
      }),

      // Last several scans with reports for visibility trend
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
        take:    orgIds.length * 5 + 50,
      }),

      // All schedules
      db.scanSchedule.findMany({
        where:  { organizationId: { in: orgIds } },
        select: { id: true, organizationId: true, isActive: true, nextRunAt: true, interval: true },
      }),

      // All recommendations (for abandonment signal)
      db.recommendation.findMany({
        where:  { perceptionScan: { organizationId: { in: orgIds } } },
        select: {
          id:               true,
          perceptionScanId: true,
          status:           true,
          perceptionScan:   { select: { organizationId: true } },
        },
      }),

      // Notifications last 14d
      db.notification.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: ago14d },
          archivedAt:     null,
        },
        select: { id: true, organizationId: true, isRead: true, createdAt: true },
      }),

      // Assertion events last 30d
      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          eventType:      { in: ASSERTION_TYPES },
          createdAt:      { gte: ago30d },
        },
        select: { id: true, organizationId: true, eventType: true, traceId: true, createdAt: true, severity: true },
      }),

      // Assertion events last 7d (friction increase signal)
      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          eventType:      { in: ASSERTION_TYPES },
          createdAt:      { gte: ago7d },
        },
        select: { id: true, organizationId: true, createdAt: true },
      }),

      // Assertion events 8–14d ago
      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          eventType:      { in: ASSERTION_TYPES },
          createdAt:      { gte: ago14d, lt: ago7d },
        },
        select: { id: true, organizationId: true, createdAt: true },
      }),
    ]);

    // ── Build lookup maps ─────────────────────────────────────────────────────

    const groupByOrg = <T extends { organizationId: string | null }>(arr: T[]) =>
      groupBy(
        arr.filter((i): i is T & { organizationId: string } => i.organizationId !== null),
        (i) => i.organizationId,
      );

    const recentScansByOrg  = groupByOrg(recentScans);
    const olderScansByOrg   = groupByOrg(olderScans);
    const schedsByOrg       = groupByOrg(allSchedules);
    const notifsByOrg       = groupByOrg(recentNotifications);
    const assertionsByOrg   = groupByOrg(recentAssertions);
    const recent7ByOrg      = groupByOrg(recent7dEvents);
    const prior7ByOrg       = groupByOrg(prior7dEvents);

    // Recs grouped by org (join through perceptionScan)
    const recsByOrg = new Map<string, typeof allRecommendations>();
    for (const rec of allRecommendations) {
      const orgId   = rec.perceptionScan.organizationId;
      const existing = recsByOrg.get(orgId) ?? [];
      existing.push(rec);
      recsByOrg.set(orgId, existing);
    }

    // Last 3 scans with reports per org
    const last3ByOrg = new Map<string, typeof allScansWithReports>();
    for (const scan of allScansWithReports) {
      const existing = last3ByOrg.get(scan.organizationId) ?? [];
      if (existing.length < 3) {
        existing.push(scan);
        last3ByOrg.set(scan.organizationId, existing);
      }
    }

    const orgMeta = new Map(orgs.map((o) => [o.id, o]));
    const calculatedAt = new Date().toISOString();

    // ── Compute per org ───────────────────────────────────────────────────────
    const results: OrganizationalDrift[] = [];

    for (const orgId of orgIds) {
      const org        = orgMeta.get(orgId);
      const orgAgeMs   = org ? now.getTime() - org.createdAt.getTime() : 0;
      const graceOver  = orgAgeMs > 7 * 24 * 60 * 60 * 1000;

      const recent30    = recentScansByOrg.get(orgId)  ?? [];
      const older30     = olderScansByOrg.get(orgId)   ?? [];
      const scheds      = schedsByOrg.get(orgId)       ?? [];
      const notifs      = notifsByOrg.get(orgId)       ?? [];
      const assertions  = assertionsByOrg.get(orgId)   ?? [];
      const recent7     = recent7ByOrg.get(orgId)      ?? [];
      const prior7      = prior7ByOrg.get(orgId)       ?? [];
      const recs        = recsByOrg.get(orgId)         ?? [];
      const last3Scans  = last3ByOrg.get(orgId)        ?? [];

      const signals: DriftSignal[]  = [];
      const interventions: string[] = [];
      const sourceScanIds:  string[] = [...recent30.map((s) => s.id), ...older30.map((s) => s.id)];
      const sourceRecIds:   string[] = recs.map((r) => r.id).slice(0, 20);
      const relatedEvIds:   string[] = assertions.map((e) => e.id).slice(0, 20);
      const traceRefs:      string[] = [...new Set(assertions.map((e) => e.traceId))].slice(0, 20);

      // Signal 1 — Scan cadence decline
      {
        let score = 0;
        if (older30.length > 0 && recent30.length < older30.length * 0.5) {
          score = proportional(1 - recent30.length / older30.length, 12.5, 1);
          signals.push({
            signal:      CONTINUITY_SIGNALS.SCAN_CADENCE_DECLINE,
            score,
            description: `Scan count dropped from ${older30.length} (31–60d) to ${recent30.length} (last 30d).`,
          });
          interventions.push('Schedule or run a new perception scan to restore cadence.');
        } else if (older30.length === 0 && recent30.length === 0 && graceOver) {
          score = 12.5;
          signals.push({
            signal:      CONTINUITY_SIGNALS.SCAN_CADENCE_DECLINE,
            score,
            description: 'No scans in the last 60 days.',
          });
          interventions.push('No scans detected — run a perception scan immediately.');
        }
      }

      // Signal 2 — Recommendation abandonment
      {
        const total      = recs.length;
        const abandoned  = recs.filter((r) => r.status === 'OPEN' || r.status === 'DISMISSED').length;
        if (total > 0) {
          const ratio = abandoned / total;
          if (ratio > 0.5) {
            const score = proportional(ratio, 12.5, 1);
            signals.push({
              signal:      CONTINUITY_SIGNALS.RECOMMENDATION_ABANDONMENT,
              score,
              description: `${abandoned} of ${total} recommendation(s) unactioned (${Math.round(ratio * 100)}% abandonment).`,
            });
            interventions.push(`Action ${abandoned} pending recommendation(s) to restore engagement.`);
          }
        }
      }

      // Signal 3 — Increasing friction
      {
        if (recent7.length > prior7.length) {
          const score = 12.5;
          signals.push({
            signal:      CONTINUITY_SIGNALS.INCREASING_FRICTION,
            score,
            description: `Assertion events increased: ${recent7.length} in last 7d vs ${prior7.length} in prior 7d.`,
          });
          interventions.push('Investigate pipeline assertion events — friction is increasing.');
        }
      }

      // Signal 4 — Stale schedules
      {
        const activeScheds = scheds.filter((s) => s.isActive);
        if (activeScheds.length > 0) {
          const staleCount = activeScheds.filter(
            (s) => s.nextRunAt && s.nextRunAt < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          ).length;
          if (staleCount > 0) {
            const score = proportional(staleCount / activeScheds.length, 12.5, 1);
            signals.push({
              signal:      CONTINUITY_SIGNALS.STALE_SCHEDULES,
              score,
              description: `${staleCount} of ${activeScheds.length} schedule(s) overdue by >7 days.`,
            });
            interventions.push('Review overdue scan schedules and re-trigger or adjust intervals.');
          }
        }
      }

      // Signal 5 — Unresolved assertions
      {
        const count = assertions.length;
        if (count >= 2) {
          const score = proportional(count, 12.5, 3);
          signals.push({
            signal:      CONTINUITY_SIGNALS.UNRESOLVED_ASSERTIONS,
            score,
            description: `${count} assertion event(s) in the last 30 days.`,
          });
          interventions.push('Resolve pipeline assertion failures — check /admin/operations for details.');
        }
      }

      // Signal 6 — Declining visibility
      {
        if (last3Scans.length >= 3) {
          const scores = last3Scans.map((s) => meanScore(s.scanReport!));
          const isConsistentlyDeclining = scores[0] < scores[1] && scores[1] < scores[2];
          const isNetDecline            = scores[0] < scores[scores.length - 1] - 5;
          if (isConsistentlyDeclining) {
            signals.push({
              signal:      CONTINUITY_SIGNALS.DECLINING_VISIBILITY,
              score:       12.5,
              description: `Scan scores declining across last 3 scans: ${scores.map((s) => s.toFixed(1)).join(' → ')}.`,
            });
            interventions.push('Visibility scores are declining — review and action high-priority recommendations.');
          } else if (isNetDecline) {
            signals.push({
              signal:      CONTINUITY_SIGNALS.DECLINING_VISIBILITY,
              score:       6.25,
              description: `Net score decline across last ${last3Scans.length} scans.`,
            });
            interventions.push('Review recommendations to arrest visibility decline.');
          }
        }
      }

      // Signal 7 — Notification disengagement
      {
        if (notifs.length > 0) {
          const unreadRate = notifs.filter((n) => !n.isRead).length / notifs.length;
          if (unreadRate > 0.7) {
            const score = proportional(unreadRate, 12.5, 1);
            signals.push({
              signal:      CONTINUITY_SIGNALS.NOTIFICATION_DISENGAGEMENT,
              score,
              description: `${Math.round(unreadRate * 100)}% of notifications in last 14d are unread.`,
            });
            interventions.push('Users are not engaging with notifications — review notification settings.');
          }
        }
      }

      // Signal 8 — Onboarding incompleteness
      {
        if (graceOver && recent30.length === 0 && scheds.filter((s) => s.isActive).length === 0) {
          signals.push({
            signal:      CONTINUITY_SIGNALS.ONBOARDING_INCOMPLETENESS,
            score:       12.5,
            description: 'Organization has not completed activation (no scans, no schedules).',
          });
          interventions.push('Complete onboarding: run first scan and configure a scan schedule.');
        }
      }

      // ── Drift score ────────────────────────────────────────────────────────
      const driftScore  = Math.min(100, Math.round(signals.reduce((sum, s) => sum + s.score, 0)));
      const driftState: DriftState =
        driftScore >= 75 ? 'CRITICAL'  :
        driftScore >= 50 ? 'DEGRADING' :
        driftScore >= 20 ? 'DRIFTING'  :
        'STABLE';

      // ── Confidence (Refinement 5) ──────────────────────────────────────────
      const totalDataPoints = recent30.length + older30.length + recs.length + assertions.length;
      const confidence: ConfidenceLevel =
        totalDataPoints >= 15 ? 'HIGH'   :
        totalDataPoints >= 5  ? 'MEDIUM' :
        'LOW';

      // ── Refinement B: drift escalation with cooldown (Refinement 10) ───────
      if (driftState === 'DEGRADING' || driftState === 'CRITICAL') {
        await OrganizationalDriftService._maybeEscalate(orgId, assertions, driftScore);
      }

      results.push({
        organizationId:           orgId,
        driftScore,
        driftState,
        contributingSignals:      signals,
        recommendedInterventions: [...new Set(interventions)],
        confidence,
        traceReferences:          traceRefs,
        relatedEventIds:          relatedEvIds,
        sourceScanIds:            sourceScanIds.slice(0, 20),
        sourceRecommendationIds:  sourceRecIds.slice(0, 20),
        calculatedAt,
        windowDays,
        calculationVersion:       'v1',
      });
    }

    return results;
  }

  // ── Refinement B + 10: drift escalation with 24h cooldown ────────────────

  private static async _maybeEscalate(
    orgId:      string,
    assertions: { createdAt: Date; severity?: string }[],
    driftScore: number,
  ): Promise<void> {
    try {
      // Check: has the org had persistent errors for >7 days?
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hasOldErrors = assertions.some((e) => e.createdAt < sevenDaysAgo);
      if (!hasOldErrors) return;

      // Cooldown: check for ORGANIZATIONAL_CONTINUITY_RISK in last 24h (Refinement 10)
      const cooldownSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentEsc = await db.operationalEvent.findFirst({
        where: {
          organizationId: orgId,
          eventType:      EVENT_TYPES.ORGANIZATIONAL_CONTINUITY_RISK,
          createdAt:      { gte: cooldownSince },
        },
        select: { id: true },
      });
      if (recentEsc) return; // within cooldown window

      void OperationalEventService.emit({
        eventType:      EVENT_TYPES.ORGANIZATIONAL_CONTINUITY_RISK,
        severity:       SEVERITIES.CRITICAL,
        source:         EVENT_SOURCES.SYSTEM_INTERNAL,
        traceId:        crypto.randomUUID(),
        organizationId: orgId,
        entityType:     'org',
        entityId:       orgId,
        message:        `Organization has been degrading for >7 days (driftScore: ${driftScore})`,
        metadata: {
          driftScore,
          persistentErrorDaysThreshold: 7,
        },
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
