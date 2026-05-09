/**
 * @fileOverview OperationalResilienceService — Sprint 8 Task 3.
 *
 * Measures operational recovery durability across 4 weighted components.
 * Pure function — no DB queries.
 *
 * resilienceScore (0–100) — 4 components (Refinement G — rewards stability):
 *   Stability   (40pts) = (1 − volatilityFactor) × 40
 *     LOW volatility → 1.0, MODERATE → 0.5, HIGH → 0.0
 *   Recovery    (25pts) = (successfulLineages / max(1, totalLineages)) × 25
 *   Cadence     (20pts) = (avgProxyScore / 65) × 20   (rewards staying above WATCHING)
 *   Durability  (15pts) = (1 − (degradations / max(1, degradations+recoveries))) × 15
 *
 * Refinements:
 *   3:  durabilityWeightApplied — true when degradation penalty reduced score
 *   7:  forecastMemoryQuality
 *   9:  generatedFromWindow
 *   C:  forecastVersion, generatedAt, basedOnWindowDays
 *   E:  traceReferences, relatedEventIds, sourceTimelineIds, sourceMilestoneIds
 *   G:  stability favored over temporary spikes; durability bias explicit
 */

import type { ContinuityReplay }           from './continuity-replay-service';
import type { OperationalMemory }          from './operational-memory-service';
import type { InterventionLineageReport }  from './intervention-lineage-service';
import type { ForecastMemoryQuality }      from './continuity-forecast-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResilienceState = 'RESILIENT' | 'RECOVERING' | 'FRAGILE' | 'UNSTABLE';

export interface OperationalResilience {
  organizationId:              string;
  resilienceState:             ResilienceState;
  resilienceScore:             number;                // 0–100
  durabilityWeightApplied:     boolean;               // Refinement 3
  strongestProtectiveFactors:  string[];
  strongestRiskFactors:        string[];
  measuredAt:                  string;
  forecastMemoryQuality:       ForecastMemoryQuality; // Refinement 7
  generatedFromWindow:         { start: string; end: string }; // Refinement 9
  forecastVersion:             'v1';                  // Refinement C
  generatedAt:                 string;
  basedOnWindowDays:           number[];
  traceReferences:             string[];              // Refinement E
  relatedEventIds:             string[];
  sourceTimelineIds:           string[];
  sourceMilestoneIds:          string[];
}

// ── OperationalResilienceService ──────────────────────────────────────────────

export class OperationalResilienceService {
  /**
   * Compute operational resilience from replay, memory, and lineage.
   * Pure function — no DB queries.
   */
  static computeForOrg(
    replay:  ContinuityReplay,
    memory:  OperationalMemory,
    lineage: InterventionLineageReport,
  ): OperationalResilience {
    const generatedAt      = new Date().toISOString();
    const { organizationId } = replay;
    const scores           = replay.snapshots.map((s) => s.proxyScore);
    const n                = scores.length;
    const avgScore         = n > 0 ? scores.reduce((a, b) => a + b, 0) / n : 0;

    // ── Component 1: Stability (40pts) — Refinement G ─────────────────────────
    const volatilityFactor =
      replay.historicalVolatility === 'HIGH'     ? 1.0 :
      replay.historicalVolatility === 'MODERATE' ? 0.5 : 0.0;
    const stabilityScore = (1 - volatilityFactor) * 40;

    // ── Component 2: Recovery (25pts) ─────────────────────────────────────────
    const totalLineages      = lineage.lineages.length;
    const successfulLineages = lineage.successfulCount;
    const recoveryScore = totalLineages === 0
      ? 0
      : Math.min(1, successfulLineages / totalLineages) * 25;

    // ── Component 3: Cadence (20pts) — rewards sustained presence above WATCHING ─
    const cadenceScore = Math.min(1, avgScore / 65) * 20;

    // ── Component 4: Durability (15pts) — penalizes degradation without recovery ─
    const degradationCount = memory.degradationPeriods.length;
    const recoveryCount    = memory.recoveryPeriods.length;
    const total            = degradationCount + recoveryCount;
    const durabilityScore  = total === 0
      ? 15 // no degradation history is good
      : (1 - degradationCount / total) * 15;
    const durabilityWeightApplied = degradationCount > 0;

    // ── Total resilience score ────────────────────────────────────────────────
    const resilienceScore = Math.round(
      stabilityScore + recoveryScore + cadenceScore + durabilityScore,
    );

    // ── Resilience state ──────────────────────────────────────────────────────
    // Derive improving trend inline from replay (no Task 2 dependency)
    const improving = (() => {
      if (n < 4) return false;
      const mid = Math.floor(n / 2);
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      return avg(scores.slice(mid)) - avg(scores.slice(0, mid)) > 5;
    })();

    const resilienceState: ResilienceState =
      resilienceScore >= 70                        ? 'RESILIENT'  :
      resilienceScore >= 45 && improving           ? 'RECOVERING' :
      resilienceScore >= 25                        ? 'FRAGILE'    :
      'UNSTABLE';

    // ── Protective factors ────────────────────────────────────────────────────
    const protective: string[] = [];
    if (replay.historicalVolatility === 'LOW') {
      protective.push('Low historical volatility observed across the window.');
    }
    if (avgScore >= 65) {
      protective.push(`Average continuity proxy score remained in the stable range (${Math.round(avgScore)}/100).`);
    }
    if (successfulLineages > 0) {
      protective.push(`${successfulLineages} successful intervention(s) with measurable continuity outcomes.`);
    }
    if (memory.recoveryPeriods.length > 0) {
      protective.push(`${memory.recoveryPeriods.length} recovery period(s) detected following degradation.`);
    }
    if (replay.transitions.length === 0) {
      protective.push('Continuity state remained consistent with no state transitions detected.');
    }

    // ── Risk factors ──────────────────────────────────────────────────────────
    const risks: string[] = [];
    if (replay.historicalVolatility === 'HIGH') {
      risks.push('High historical volatility reduces resilience durability.');
    }
    if (memory.unresolvedPatterns.length > 0) {
      risks.push(`${memory.unresolvedPatterns.length} unresolved operational pattern(s) detected.`);
    }
    if (lineage.failedCount > 0) {
      risks.push(`${lineage.failedCount} intervention(s) did not produce observable improvement.`);
    }
    if (degradationCount > recoveryCount) {
      risks.push('Degradation periods exceeded recovery periods in the observed window.');
    }
    if (avgScore < 40) {
      risks.push(`Average proxy score remained below the WATCHING threshold (${Math.round(avgScore)}/100).`);
    }

    // ── Forecast memory quality (Refinement 7) ────────────────────────────────
    const totalEvents = memory.operationalPhases.reduce((s: number, p: any) => s + (p.eventCount ?? 0), 0);
    const forecastMemoryQuality: ForecastMemoryQuality =
      (n >= 10 && totalEvents >= 15) ? 'RICH'     :
      (n >= 5  || totalEvents >= 5)  ? 'MODERATE' :
      'SPARSE';

    return {
      organizationId,
      resilienceState,
      resilienceScore:            Math.min(100, Math.max(0, resilienceScore)),
      durabilityWeightApplied,
      strongestProtectiveFactors: protective.slice(0, 5),
      strongestRiskFactors:       risks.slice(0, 5),
      measuredAt:                 generatedAt,
      forecastMemoryQuality,
      generatedFromWindow:        replay.generatedFromWindow,
      forecastVersion:            'v1',
      generatedAt,
      basedOnWindowDays:          [replay.windowDays],
      traceReferences:            replay.traceReferences.slice(0, 10),
      relatedEventIds:            replay.relatedEventIds.slice(0, 20),
      sourceTimelineIds:          [organizationId],
      sourceMilestoneIds:         [],
    };
  }

  static computeForOrgs(
    orgIds:   string[],
    replays:  Map<string, ContinuityReplay>,
    memories: Map<string, OperationalMemory>,
    lineages: Map<string, InterventionLineageReport>,
  ): OperationalResilience[] {
    const results: OperationalResilience[] = [];
    for (const orgId of orgIds) {
      const rep = replays.get(orgId);
      const mem = memories.get(orgId);
      const lin = lineages.get(orgId);
      if (!rep || !mem || !lin) continue;
      results.push(OperationalResilienceService.computeForOrg(rep, mem, lin));
    }
    return results;
  }
}
