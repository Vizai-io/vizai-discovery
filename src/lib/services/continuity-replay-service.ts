/**
 * @fileOverview ContinuityReplayService — Sprint 7 Task 5.
 *
 * Reconstructs continuity state evolution over time using a proxy scoring
 * model computed from historical raw Postgres data. No persisted snapshots
 * required — fully reproducible from the same input data set (Refinement D).
 *
 * Proxy continuity score at time T:
 *   scanActivity  = min(scansIn30d(T) / expectedScans, 1) × 50
 *   recActivity   = appliedRecs(T) / totalRecs(T) × 25   (or 15 if no recs)
 *   frictionPenalty = min(assertionsIn7d(T) × 5, 25)
 *   proxy = scanActivity + recActivity + max(0, 25 - frictionPenalty)
 *
 * Supported windows: 7d, 30d, 90d, 365d
 * Snapshot intervals: 7d→daily(7), 30d→3-day(10), 90d→weekly(13), 365d→biweekly(26)
 *
 * Refinements:
 *   2:  historicalVolatility — LOW | MODERATE | HIGH
 *   5:  integrityChecks — { missingWindows, incompleteSnapshots, inferredTransitions }
 *   D:  replayVersion: 'v1', generatedAt, windowDays
 *   A:  traceReferences, relatedEventIds, sourceEntityIds
 *   9:  generatedFromWindow
 */

import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContinuityStateProxy  = 'HEALTHY' | 'WATCHING' | 'FRAGMENTED' | 'STALLED';
export type HistoricalVolatility  = 'LOW' | 'MODERATE' | 'HIGH';   // Refinement 2
export type ReplayWindowDays      = 7 | 30 | 90 | 365;

export interface ContinuitySnapshot {
  snapshotAt:    string;         // ISO8601 — point-in-time
  proxyScore:    number;         // 0–100
  state:         ContinuityStateProxy;
  scansIn30d:    number;
  appliedRecs:   number;
  totalRecs:     number;
  assertionsIn7d:number;
  isInferred:    boolean;        // true if derived from sparse data
}

export interface ReplayTransition {
  from:          ContinuityStateProxy | 'UNKNOWN';
  to:            ContinuityStateProxy;
  changedAt:     string;
  likelyDrivers: string[];
}

export interface ContinuityReplay {
  organizationId:     string;
  snapshots:          ContinuitySnapshot[];
  transitions:        ReplayTransition[];
  historicalVolatility: HistoricalVolatility;  // Refinement 2
  integrityChecks:    {                         // Refinement 5
    missingWindows:        number;
    incompleteSnapshots:   number;
    inferredTransitions:   number;
  };
  replayVersion:      'v1';                     // Refinement D
  generatedAt:        string;
  windowDays:         ReplayWindowDays;
  traceReferences:    string[];                 // Refinement A
  relatedEventIds:    string[];                 // Refinement A
  sourceEntityIds:    string[];                 // Refinement A
  generatedFromWindow: { start: string; end: string }; // Refinement 9
}

// ── Snapshot interval config per window ───────────────────────────────────────

const SNAPSHOT_CONFIG: Record<ReplayWindowDays, { count: number; stepDays: number }> = {
  7:   { count:  7, stepDays: 1  },
  30:  { count: 10, stepDays: 3  },
  90:  { count: 13, stepDays: 7  },
  365: { count: 26, stepDays: 14 },
};

const ASSERTION_TYPES = [
  'FREE_SCAN_PIPELINE_INCOMPLETE',
  'PUBLIC_RUNTIME_FLOW_BROKEN',
  'RANKING_PIPELINE_INCOMPLETE',
  'SYSTEM_RUNTIME_DEGRADATION',
  'ORGANIZATIONAL_CONTINUITY_RISK',
];

// ── ContinuityReplayService ───────────────────────────────────────────────────

export class ContinuityReplayService {
  /**
   * Reconstruct continuity replay for multiple organizations.
   * Issues one batch query per data domain across all orgs + window buffer.
   */
  static async computeForOrgs(
    orgIds:     string[],
    windowDays: ReplayWindowDays = 90,
  ): Promise<ContinuityReplay[]> {
    if (orgIds.length === 0) return [];

    const now         = new Date();
    // Load data for full window + 30d lookback buffer for score computation
    const bufferDays  = windowDays + 30;
    const loadStart   = new Date(now.getTime() - bufferDays * 24 * 60 * 60 * 1000);
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // ── Batch queries ─────────────────────────────────────────────────────────
    const [scans, allRecs, assertionEvents] = await Promise.all([
      db.perceptionScan.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: loadStart },
          status:         { in: ['COMPLETE', 'PARTIAL'] },
        },
        select: { id: true, organizationId: true, createdAt: true, completedAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // All recommendations (for total count context)
      db.recommendation.findMany({
        where: { perceptionScan: { organizationId: { in: orgIds } } },
        select: {
          id: true, status: true, completedAt: true, actionedAt: true,
          perceptionScan: { select: { organizationId: true } },
        },
        orderBy: { completedAt: 'asc' },
      }),

      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          eventType:      { in: ASSERTION_TYPES },
          createdAt:      { gte: loadStart },
        },
        select: {
          id: true, organizationId: true, eventType: true, traceId: true, createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // ── Build lookup structures ───────────────────────────────────────────────
    const scansByOrg  = groupByOrg(scans, (s) => s.organizationId);
    const recsByOrg   = new Map<string, typeof allRecs>();
    for (const rec of allRecs) {
      if (!rec.perceptionScan) continue;
      const oid = rec.perceptionScan.organizationId;
      const existing = recsByOrg.get(oid) ?? [];
      existing.push(rec);
      recsByOrg.set(oid, existing);
    }
    const assertionsByOrg = groupByOrg(
      assertionEvents.filter(
        (e): e is typeof assertionEvents[0] & { organizationId: string } =>
          e.organizationId !== null,
      ),
      (e) => e.organizationId,
    );

    const generatedAt = new Date().toISOString();
    const { count: snapshotCount, stepDays } = SNAPSHOT_CONFIG[windowDays];

    // ── Compute per org ───────────────────────────────────────────────────────
    const results: ContinuityReplay[] = [];

    for (const orgId of orgIds) {
      const orgScans      = scansByOrg.get(orgId)     ?? [];
      const orgRecs       = recsByOrg.get(orgId)      ?? [];
      const orgAssertions = assertionsByOrg.get(orgId)?? [];

      const snapshots:   ContinuitySnapshot[]  = [];
      let missingWindows      = 0;
      let incompleteSnapshots = 0;

      // Generate snapshot at each step
      for (let i = 0; i < snapshotCount; i++) {
        const snapshotTs = new Date(
          windowStart.getTime() + i * stepDays * 24 * 60 * 60 * 1000,
        );
        const snapshotMs = snapshotTs.getTime();

        // scansIn30d(T) — scans completed in 30d before T
        const thirtyDayMs = 30 * 24 * 60 * 60 * 1000;
        const sevenDayMs  = 7 * 24 * 60 * 60 * 1000;

        const scansIn30d = orgScans.filter((s) => {
          const ts = (s.completedAt ?? s.createdAt).getTime();
          return ts <= snapshotMs && ts >= snapshotMs - thirtyDayMs;
        }).length;

        const assertionsIn7d = orgAssertions.filter((e) => {
          const ts = e.createdAt.getTime();
          return ts <= snapshotMs && ts >= snapshotMs - sevenDayMs;
        }).length;

        const totalRecs  = orgRecs.filter((r) => {
          const created = (r.actionedAt ?? r.completedAt ?? new Date(0)).getTime();
          return created <= snapshotMs;
        }).length;

        const appliedRecs = orgRecs.filter((r) => {
          const applied = (r.completedAt ?? r.actionedAt)?.getTime() ?? 0;
          return applied > 0 && applied <= snapshotMs &&
                 (r.status === 'COMPLETED' || r.status === 'IN_PROGRESS');
        }).length;

        // Proxy score computation
        const expectedScans = windowDays <= 7 ? 1 : windowDays <= 30 ? 2 : 4;
        const scanActivity  = Math.min(1, scansIn30d / Math.max(1, expectedScans)) * 50;
        const recActivity   = totalRecs === 0 ? 15 : (appliedRecs / totalRecs) * 25;
        const frictionPenalty = Math.min(25, assertionsIn7d * 5);
        const proxyScore    = Math.round(scanActivity + recActivity + Math.max(0, 25 - frictionPenalty));

        const state: ContinuityStateProxy =
          proxyScore >= 70 ? 'HEALTHY'   :
          proxyScore >= 45 ? 'WATCHING'  :
          proxyScore >= 20 ? 'FRAGMENTED':
          'STALLED';

        const isInferred = scansIn30d === 0;
        if (isInferred) incompleteSnapshots++;
        if (scansIn30d === 0 && assertionsIn7d === 0 && totalRecs === 0) missingWindows++;

        snapshots.push({
          snapshotAt:    snapshotTs.toISOString(),
          proxyScore,
          state,
          scansIn30d,
          appliedRecs,
          totalRecs,
          assertionsIn7d,
          isInferred,
        });
      }

      // ── Transitions ──────────────────────────────────────────────────────────
      const transitions: ReplayTransition[] = [];
      let inferredTransitions = 0;

      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1];
        const curr = snapshots[i];
        if (prev.state !== curr.state) {
          const drivers: string[] = [];
          if (curr.scansIn30d !== prev.scansIn30d) {
            drivers.push(`Scan activity changed (${prev.scansIn30d} → ${curr.scansIn30d} scans in prior 30d).`);
          }
          if (curr.assertionsIn7d !== prev.assertionsIn7d) {
            drivers.push(`Assertion events changed (${prev.assertionsIn7d} → ${curr.assertionsIn7d} in 7d).`);
          }
          if (prev.isInferred || curr.isInferred) inferredTransitions++;

          transitions.push({
            from:          prev.state,
            to:            curr.state,
            changedAt:     curr.snapshotAt,
            likelyDrivers: drivers.length > 0 ? drivers : ['Proxy score shifted across state boundary.'],
          });
        }
      }

      // ── Historical volatility (Refinement 2) ─────────────────────────────────
      const scores = snapshots.map((s) => s.proxyScore);
      const variance = scores.length > 1
        ? scores.reduce((sum, s) => sum + Math.pow(s - scores.reduce((a, b) => a + b, 0) / scores.length, 2), 0) / scores.length
        : 0;
      const stateOscillations = transitions.length;

      const historicalVolatility: HistoricalVolatility =
        (stateOscillations >= 4 || variance > 400) ? 'HIGH'     :
        (stateOscillations >= 2 || variance > 150) ? 'MODERATE' :
        'LOW';

      // ── Lineage (Refinement A) ────────────────────────────────────────────
      const traceReferences = [...new Set(
        orgAssertions.filter((e) => e.traceId).map((e) => e.traceId as string),
      )].slice(0, 10);
      const relatedEventIds = orgAssertions.map((e) => e.id).slice(0, 20);
      const sourceEntityIds = orgScans.map((s) => s.id).slice(0, 20);

      results.push({
        organizationId:     orgId,
        snapshots,
        transitions,
        historicalVolatility,
        integrityChecks: {
          missingWindows,
          incompleteSnapshots,
          inferredTransitions,
        },
        replayVersion:      'v1',
        generatedAt,
        windowDays,
        traceReferences,
        relatedEventIds,
        sourceEntityIds,
        generatedFromWindow: {
          start: windowStart.toISOString(),
          end:   now.toISOString(),
        },
      });
    }

    return results;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByOrg<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const existing = map.get(k) ?? [];
    existing.push(item);
    map.set(k, existing);
  }
  return map;
}
