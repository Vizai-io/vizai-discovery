/**
 * @fileOverview InterventionTimingService — Sprint 8 Task 4.
 *
 * Identifies when interventions are most effective based on historical lineage data.
 * Pure function — no DB queries.
 *
 * Methodology:
 *   1. Derive recommended intervention window from current continuity state + velocity
 *   2. Compute average recovery days from SUCCESSFUL lineage chains
 *   3. Classify historical effectiveness from outcome ratios + causality strength
 *   4. Derive timing confidence from lineage density + consistency (Refinement 4)
 *   5. Build explanatory basedOnPatterns strings
 *
 * InterventionWindow:
 *   IMMEDIATE    — latest snapshot state is FRAGMENTED or CRITICAL
 *   SHORT_TERM   — trajectory DECLINING or HIGH volatility or WATCHING with declining score
 *   MONITOR      — WATCHING with stable/improving velocity
 *   LOW_PRIORITY — STABLE or OPTIMIZING
 *
 * Refinements:
 *   4:  timingConfidence — LOW | MEDIUM | HIGH
 *   7:  forecastMemoryQuality
 *   9:  generatedFromWindow
 *   C:  forecastVersion, generatedAt, basedOnWindowDays
 *   E:  traceReferences, relatedEventIds, sourceTimelineIds, sourceMilestoneIds
 *   F:  advisory only — no state mutations, no auto-triggers
 */

import type { InterventionLineageReport } from './intervention-lineage-service';
import type { ContinuityReplay }          from './continuity-replay-service';
import type { ForecastMemoryQuality }     from './continuity-forecast-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InterventionWindow       = 'IMMEDIATE' | 'SHORT_TERM' | 'MONITOR' | 'LOW_PRIORITY';
export type TimingEffectiveness      = 'HIGH' | 'MEDIUM' | 'LOW';
export type TimingConfidence         = 'LOW' | 'MEDIUM' | 'HIGH';              // Refinement 4

export interface InterventionTimingInsight {
  organizationId:                  string;
  recommendedInterventionWindow:   InterventionWindow;
  historicalEffectiveness:         TimingEffectiveness;
  averageRecoveryDays?:            number;
  basedOnPatterns:                 string[];
  timingConfidence:                TimingConfidence;   // Refinement 4
  forecastMemoryQuality:           ForecastMemoryQuality; // Refinement 7
  generatedFromWindow:             { start: string; end: string }; // Refinement 9
  forecastVersion:                 'v1';               // Refinement C
  generatedAt:                     string;
  basedOnWindowDays:               number[];
  traceReferences:                 string[];           // Refinement E
  relatedEventIds:                 string[];
  sourceTimelineIds:               string[];
  sourceMilestoneIds:              string[];
}

// ── InterventionTimingService ─────────────────────────────────────────────────

export class InterventionTimingService {
  /**
   * Compute intervention timing insight from lineage + replay.
   * Pure function — no DB queries. Advisory only (Refinement F).
   */
  static computeForOrg(
    lineage: InterventionLineageReport,
    replay:  ContinuityReplay,
  ): InterventionTimingInsight {
    const generatedAt       = new Date().toISOString();
    const { organizationId } = lineage;
    const snapshots         = replay.snapshots;
    const n                 = snapshots.length;

    // ── Current state from latest snapshot ────────────────────────────────────
    const latestSnap  = snapshots.at(-1);
    const latestScore = latestSnap?.proxyScore ?? 40;
    const latestState = latestSnap?.state ?? 'WATCHING';

    // Simple velocity from last 4 snapshots
    const recent  = snapshots.slice(-4).map((s) => s.proxyScore);
    const velocity = recent.length >= 2
      ? recent[recent.length - 1] - recent[0]
      : 0;

    // ── Recommended intervention window ───────────────────────────────────────
    let recommendedInterventionWindow: InterventionWindow;
    if (latestState === 'FRAGMENTED' || latestState === 'STALLED') {
      recommendedInterventionWindow = 'IMMEDIATE';
    } else if (
      replay.historicalVolatility === 'HIGH' ||
      velocity < -5
    ) {
      recommendedInterventionWindow = 'SHORT_TERM';
    } else if (latestState === 'WATCHING') {
      recommendedInterventionWindow = velocity < 0 ? 'SHORT_TERM' : 'MONITOR';
    } else {
      recommendedInterventionWindow = 'LOW_PRIORITY';
    }

    // ── Average recovery days from SUCCESSFUL lineages ────────────────────────
    const successfulWithDates = lineage.lineages.filter(
      (l) => l.outcome === 'SUCCESSFUL' && l.completedAt,
    );
    let averageRecoveryDays: number | undefined;
    if (successfulWithDates.length > 0) {
      const totalMs = successfulWithDates.reduce((sum, l) => {
        const ms = new Date(l.completedAt!).getTime() - new Date(l.startedAt).getTime();
        return sum + Math.max(0, ms);
      }, 0);
      averageRecoveryDays = Math.round(totalMs / successfulWithDates.length / (1000 * 60 * 60 * 24));
    }

    // ── Historical effectiveness ───────────────────────────────────────────────
    const { successfulCount, failedCount, partialCount, averageCausalityStrength } = lineage;
    const historicalEffectiveness: TimingEffectiveness =
      (successfulCount > (failedCount + partialCount) && averageCausalityStrength === 'STRONG') ? 'HIGH'   :
      (successfulCount >= failedCount)                                                           ? 'MEDIUM' :
      'LOW';

    // ── Timing confidence (Refinement 4) ──────────────────────────────────────
    const lineageDensity    = lineage.lineages.length;
    const hasConsistentData = replay.integrityChecks.missingWindows < 3;
    const timingConfidence: TimingConfidence =
      (lineageDensity >= 3 && hasConsistentData && replay.historicalVolatility !== 'HIGH') ? 'HIGH'   :
      (lineageDensity >= 1 || hasConsistentData)                                            ? 'MEDIUM' :
      'LOW';

    // ── Based on patterns ─────────────────────────────────────────────────────
    const basedOnPatterns = buildPatterns(
      lineage, recommendedInterventionWindow, averageRecoveryDays, historicalEffectiveness,
    );

    // ── Forecast memory quality (Refinement 7) ────────────────────────────────
    const forecastMemoryQuality: ForecastMemoryQuality =
      (lineageDensity >= 5 && n >= 10) ? 'RICH'     :
      (lineageDensity >= 2 || n >= 5)  ? 'MODERATE' :
      'SPARSE';

    return {
      organizationId,
      recommendedInterventionWindow,
      historicalEffectiveness,
      averageRecoveryDays,
      basedOnPatterns:      basedOnPatterns.slice(0, 5),
      timingConfidence,
      forecastMemoryQuality,
      generatedFromWindow:  replay.generatedFromWindow,
      forecastVersion:      'v1',
      generatedAt,
      basedOnWindowDays:    [replay.windowDays],
      traceReferences:      lineage.traceReferences.slice(0, 10),
      relatedEventIds:      lineage.relatedEventIds.slice(0, 20),
      sourceTimelineIds:    [organizationId],
      sourceMilestoneIds:   [],
    };
  }

  static computeForOrgs(
    orgIds:   string[],
    lineages: Map<string, InterventionLineageReport>,
    replays:  Map<string, ContinuityReplay>,
  ): InterventionTimingInsight[] {
    const results: InterventionTimingInsight[] = [];
    for (const orgId of orgIds) {
      const lin = lineages.get(orgId);
      const rep = replays.get(orgId);
      if (!lin || !rep) continue;
      results.push(InterventionTimingService.computeForOrg(lin, rep));
    }
    return results;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPatterns(
  lineage:    InterventionLineageReport,
  window:     InterventionWindow,
  avgDays:    number | undefined,
  effective:  TimingEffectiveness,
): string[] {
  const patterns: string[] = [];

  if (lineage.successfulCount > 0 && avgDays !== undefined) {
    patterns.push(
      `${lineage.successfulCount} prior intervention(s) resolved within approximately ${avgDays} day(s) on average.`,
    );
  }

  if (lineage.averageCausalityStrength === 'STRONG') {
    patterns.push('Interventions showed strong causal correlation with continuity improvement.');
  } else if (lineage.averageCausalityStrength === 'MODERATE') {
    patterns.push('Interventions showed moderate causal correlation with outcomes.');
  }

  if (window === 'IMMEDIATE') {
    patterns.push('Current continuity state suggests intervention would be most effective now.');
  } else if (window === 'SHORT_TERM') {
    patterns.push('Declining trajectory indicates intervention in the near term is advisable.');
  } else if (window === 'MONITOR') {
    patterns.push('Current trajectory is stable — monitoring is the appropriate near-term posture.');
  }

  if (lineage.failedCount > 0) {
    patterns.push(`${lineage.failedCount} prior intervention(s) did not produce measurable improvement — timing or scope may need adjustment.`);
  }

  if (lineage.lineages.length === 0) {
    patterns.push('No historical intervention data available — timing is estimated from continuity signals alone.');
  }

  return patterns;
}
