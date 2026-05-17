/**
 * @fileOverview IntelligenceDiffService — Sprint 10 Task 3.
 *
 * Compares current computed intelligence against the most recent persisted
 * OrgIntelligenceSnapshot to produce a delta view per org.
 *
 * Pure function — no DB queries. Snapshots are pre-fetched by the caller.
 *
 * Used by:
 *   - /api/admin/intelligence — to attach deltas to each org's response
 *   - IntelligenceAlertingService (Sprint 12) — to detect threshold crossings
 *   - AdminHealthCenterService (Sprint 13) — to surface change-since-last-snapshot
 */

import type { ContinuityForecast }       from './continuity-forecast-service';
import type { OperationalArchetype }     from './operational-archetype-service';
import type { OperationalRiskForecast }  from './operational-risk-forecast-service';
import type { InterventionTimingInsight } from './intervention-timing-service';
import type { OperationalResilience }    from './operational-resilience-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntelligenceDiff {
  organizationId:               string;
  hasDiff:                      boolean;
  lastSnapshotAt?:              string;   // ISO date of previous snapshot

  archetypeChanged:             boolean;
  previousArchetype?:           string;

  continuityStateChanged:       boolean;
  previousState?:               string;
  continuityStateRankDelta:     number;   // current rank − previous rank (positive = improved)

  riskLevelChanged:             boolean;
  previousRiskLevel?:           string;
  riskLevelRankDelta:           number;   // positive = risk decreased (better)

  resilienceScoreDelta:         number;   // current − previous (signed)

  interventionWindowChanged:    boolean;
  previousInterventionWindow?:  string;
  interventionWindowWorsened:   boolean;  // true if moved toward IMMEDIATE
}

// ── State rank helpers ────────────────────────────────────────────────────────

const CONTINUITY_RANK: Record<string, number> = {
  OPTIMIZING: 4, STABLE: 3, WATCHING: 2, FRAGMENTED: 1, CRITICAL: 0,
};

const RISK_RANK: Record<string, number> = {
  LOW: 3, MEDIUM: 2, HIGH: 1, CRITICAL: 0,
};

const INTERVENTION_RANK: Record<string, number> = {
  LOW_PRIORITY: 3, MONITOR: 2, SHORT_TERM: 1, IMMEDIATE: 0,
};

// ── IntelligenceDiffService ───────────────────────────────────────────────────

export class IntelligenceDiffService {
  /**
   * Compute the diff between current intelligence and the last persisted snapshot.
   * Returns a no-diff result if no snapshot exists yet.
   */
  static diffForOrg(
    orgId:    string,
    forecast: ContinuityForecast,
    archetype: OperationalArchetype,
    risk:     OperationalRiskForecast,
    timing:   InterventionTimingInsight,
    resilience: OperationalResilience,
    previous: { snapshotAt: Date; archetype: string; continuityState: string; riskLevel: string; interventionWindow: string; resilienceScore: number } | null,
  ): IntelligenceDiff {
    if (!previous) {
      return {
        organizationId:            orgId,
        hasDiff:                   false,
        archetypeChanged:          false,
        continuityStateChanged:    false,
        continuityStateRankDelta:  0,
        riskLevelChanged:          false,
        riskLevelRankDelta:        0,
        resilienceScoreDelta:      0,
        interventionWindowChanged: false,
        interventionWindowWorsened: false,
      };
    }

    const currentState  = forecast.currentState;
    const currentRisk   = risk.riskLevel;
    const currentWindow = timing.recommendedInterventionWindow;
    const currentArch   = archetype.archetype;

    const archetypeChanged       = currentArch   !== previous.archetype;
    const continuityStateChanged = currentState  !== previous.continuityState;
    const riskLevelChanged       = currentRisk   !== previous.riskLevel;
    const interventionWindowChanged = currentWindow !== previous.interventionWindow;

    const continuityStateRankDelta =
      (CONTINUITY_RANK[currentState]  ?? 2) - (CONTINUITY_RANK[previous.continuityState]  ?? 2);
    const riskLevelRankDelta =
      (RISK_RANK[currentRisk]         ?? 1) - (RISK_RANK[previous.riskLevel]              ?? 1);
    const interventionWindowWorsened =
      interventionWindowChanged &&
      (INTERVENTION_RANK[currentWindow] ?? 2) < (INTERVENTION_RANK[previous.interventionWindow] ?? 2);

    const hasDiff =
      archetypeChanged ||
      continuityStateChanged ||
      riskLevelChanged ||
      interventionWindowChanged ||
      Math.abs(resilience.resilienceScore - previous.resilienceScore) >= 5;

    return {
      organizationId:            orgId,
      hasDiff,
      lastSnapshotAt:            previous.snapshotAt.toISOString(),
      archetypeChanged,
      previousArchetype:         archetypeChanged ? previous.archetype : undefined,
      continuityStateChanged,
      previousState:             continuityStateChanged ? previous.continuityState : undefined,
      continuityStateRankDelta,
      riskLevelChanged,
      previousRiskLevel:         riskLevelChanged ? previous.riskLevel : undefined,
      riskLevelRankDelta,
      resilienceScoreDelta:      resilience.resilienceScore - previous.resilienceScore,
      interventionWindowChanged,
      previousInterventionWindow: interventionWindowChanged ? previous.interventionWindow : undefined,
      interventionWindowWorsened,
    };
  }

  /**
   * Compute diffs for all orgs in batch.
   */
  static diffForOrgs(
    orgIds:       string[],
    forecastMap:  Map<string, ContinuityForecast>,
    archetypeMap: Map<string, OperationalArchetype>,
    riskMap:      Map<string, OperationalRiskForecast>,
    timingMap:    Map<string, InterventionTimingInsight>,
    resilienceMap: Map<string, OperationalResilience>,
    snapshots:    Map<string, { snapshotAt: Date; archetype: string; continuityState: string; riskLevel: string; interventionWindow: string; resilienceScore: number }>,
  ): Map<string, IntelligenceDiff> {
    const result = new Map<string, IntelligenceDiff>();
    for (const orgId of orgIds) {
      const f  = forecastMap.get(orgId);
      const a  = archetypeMap.get(orgId);
      const r  = riskMap.get(orgId);
      const ti = timingMap.get(orgId);
      const re = resilienceMap.get(orgId);
      if (!f || !a || !r || !ti || !re) continue;
      result.set(
        orgId,
        IntelligenceDiffService.diffForOrg(orgId, f, a, r, ti, re, snapshots.get(orgId) ?? null),
      );
    }
    return result;
  }
}
