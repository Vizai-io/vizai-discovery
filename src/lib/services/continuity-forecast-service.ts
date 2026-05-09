/**
 * @fileOverview ContinuityForecastService — Sprint 8 Task 1.
 *
 * Deterministic operational continuity trajectory forecasting.
 * NO ML. NO AI. NO probabilistic modeling.
 *
 * Methodology:
 *   1. Map latest replay snapshot proxyScore to ForecastContinuityState (5-state)
 *   2. Compute linear velocity from last 6 proxy scores
 *   3. Normalize velocity to per-day rate using replay stepDays
 *   4. Apply 0.7 decay factor to 90d projection (uncertainty grows with horizon)
 *   5. Apply volatility penalty (Refinement B) — dampen HIGH-volatility projections
 *   6. Derive forecastStability from volatility + oscillation + divergence (Refinement 1)
 *   7. Compute forecastDivergence = abs(projectedScore90d − projectedScore30d) (Refinement 2)
 *   8. Detect continuityAcceleration from velocity change between replay thirds (Refinement 8)
 *   9. Derive forecastMemoryQuality from event density + replay coverage (Refinement 7)
 *  10. Build forecastIntegrity (Refinement A)
 *
 * Refinements:
 *   1:  forecastStability — STABLE | VOLATILE | UNSTABLE
 *   2:  forecastDivergence
 *   7:  forecastMemoryQuality
 *   8:  continuityAcceleration
 *   9:  generatedFromWindow
 *   A:  forecastIntegrity
 *   B:  volatility penalty
 *   C:  forecastVersion, generatedAt, basedOnWindowDays
 *   E:  traceReferences, relatedEventIds, sourceTimelineIds, sourceMilestoneIds
 */

import type { ContinuityReplay }        from './continuity-replay-service';
import type { OrganizationalTimeline }  from './organizational-timeline-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ForecastContinuityState = 'OPTIMIZING' | 'STABLE' | 'WATCHING' | 'FRAGMENTED' | 'CRITICAL';
export type ForecastContinuityTrend = 'IMPROVING' | 'STABLE' | 'DECLINING';
export type ForecastConfidence      = 'LOW' | 'MEDIUM' | 'HIGH';
export type ForecastStability       = 'STABLE' | 'VOLATILE' | 'UNSTABLE';      // Refinement 1
export type ContinuityAcceleration  =                                           // Refinement 8
  | 'ACCELERATING_RECOVERY'
  | 'ACCELERATING_DECLINE'
  | 'LINEAR'
  | 'INCONSISTENT';
export type ForecastMemoryQuality   = 'SPARSE' | 'MODERATE' | 'RICH';          // Refinement 7

export interface ForecastIntegrity {                                            // Refinement A
  eventDensity:              'LOW' | 'MEDIUM' | 'HIGH';
  replayCoverage:            'SPARSE' | 'MODERATE' | 'RICH';
  volatilityPenaltyApplied:  boolean;
}

export interface ContinuityForecast {
  organizationId:         string;
  currentState:           ForecastContinuityState;
  projectedState30d:      ForecastContinuityState;
  projectedState90d:      ForecastContinuityState;
  continuityTrend:        ForecastContinuityTrend;
  confidence:             ForecastConfidence;
  drivingSignals:         string[];
  forecastStability:      ForecastStability;          // Refinement 1
  forecastDivergence:     number;                     // Refinement 2
  forecastMemoryQuality:  ForecastMemoryQuality;      // Refinement 7
  continuityAcceleration: ContinuityAcceleration;     // Refinement 8
  generatedFromWindow:    { start: string; end: string }; // Refinement 9
  forecastIntegrity:      ForecastIntegrity;          // Refinement A
  forecastVersion:        'v1';                       // Refinement C
  generatedAt:            string;
  basedOnWindowDays:      number[];
  traceReferences:        string[];                   // Refinement E
  relatedEventIds:        string[];
  sourceTimelineIds:      string[];
  sourceMilestoneIds:     string[];
}

// ── ContinuityForecastService ─────────────────────────────────────────────────

export class ContinuityForecastService {
  /**
   * Compute a deterministic continuity forecast for a single organization.
   * Pure function — no DB queries.
   */
  static computeForOrg(
    replay:   ContinuityReplay,
    timeline: OrganizationalTimeline,
  ): ContinuityForecast {
    const generatedAt     = new Date().toISOString();
    const { organizationId } = replay;
    const scores          = replay.snapshots.map((s) => s.proxyScore);
    const n               = scores.length;

    // ── Current state ─────────────────────────────────────────────────────────
    const latestScore   = n > 0 ? scores[n - 1] : 40;
    const currentState  = scoreToForecastState(latestScore);

    // ── Linear velocity from last 6 snapshots ─────────────────────────────────
    const recentScores  = scores.slice(-6);
    const rawVelocity   = recentScores.length >= 2
      ? (recentScores[recentScores.length - 1] - recentScores[0]) / (recentScores.length - 1)
      : 0;

    // Volatility penalty (Refinement B) — dampen projections when data is noisy
    const volatilityPenaltyApplied = replay.historicalVolatility === 'HIGH';
    const effectiveVelocity = volatilityPenaltyApplied ? rawVelocity * 0.4 : rawVelocity;

    // Normalize to per-day rate
    const stepDays       = stepDaysForWindow(replay.windowDays);
    const velocityPerDay = effectiveVelocity / Math.max(1, stepDays);

    // ── Projected scores ──────────────────────────────────────────────────────
    const projectedScore30d = clamp(Math.round(latestScore + velocityPerDay * 30), 0, 100);
    const projectedScore90d = clamp(Math.round(latestScore + velocityPerDay * 90 * 0.7), 0, 100);

    const projectedState30d = scoreToForecastState(projectedScore30d);
    const projectedState90d = scoreToForecastState(projectedScore90d);

    // ── Forecast divergence (Refinement 2) ────────────────────────────────────
    const forecastDivergence = Math.abs(projectedScore90d - projectedScore30d);

    // ── Continuity trend ──────────────────────────────────────────────────────
    const continuityTrend = deriveTrend(scores);

    // ── Continuity acceleration (Refinement 8) ────────────────────────────────
    const continuityAcceleration = deriveAcceleration(scores, replay.transitions.length);

    // ── Confidence ────────────────────────────────────────────────────────────
    const eventDensity    = deriveEventDensity(timeline.events.length);
    const replayCoverage: ForecastMemoryQuality =
      n >= 10 ? 'RICH' : n >= 5 ? 'MODERATE' : 'SPARSE';

    let confidence: ForecastConfidence =
      (n >= 10 && eventDensity !== 'LOW' && !volatilityPenaltyApplied) ? 'HIGH' :
      n >= 4                                                             ? 'MEDIUM' :
      'LOW';
    if (volatilityPenaltyApplied && confidence === 'HIGH') confidence = 'MEDIUM';

    // ── Forecast stability (Refinement 1) ─────────────────────────────────────
    const oscillations = replay.transitions.length;
    const forecastStability: ForecastStability =
      (replay.historicalVolatility === 'HIGH' || forecastDivergence >= 25 || oscillations >= 4)
        ? 'UNSTABLE' :
      (replay.historicalVolatility === 'MODERATE' || forecastDivergence >= 10 || oscillations >= 2)
        ? 'VOLATILE' :
      'STABLE';

    // ── Forecast memory quality (Refinement 7) ────────────────────────────────
    const forecastMemoryQuality: ForecastMemoryQuality =
      (eventDensity === 'HIGH' && replayCoverage === 'RICH') ? 'RICH'     :
      (eventDensity !== 'LOW'  || replayCoverage !== 'SPARSE') ? 'MODERATE' :
      'SPARSE';

    // ── Driving signals ───────────────────────────────────────────────────────
    const drivingSignals = buildDrivingSignals(
      velocityPerDay, replay, continuityAcceleration, forecastDivergence,
    );

    // ── Lineage (Refinement E) ────────────────────────────────────────────────
    const traceReferences  = replay.traceReferences.slice(0, 10);
    const relatedEventIds  = replay.relatedEventIds.slice(0, 20);
    const sourceTimelineIds  = [organizationId];
    const sourceMilestoneIds = timeline.milestones.map((m) => m.milestoneType).slice(0, 10);

    return {
      organizationId,
      currentState,
      projectedState30d,
      projectedState90d,
      continuityTrend,
      confidence,
      drivingSignals:         drivingSignals.slice(0, 5),
      forecastStability,
      forecastDivergence,
      forecastMemoryQuality,
      continuityAcceleration,
      generatedFromWindow:    replay.generatedFromWindow,
      forecastIntegrity: {
        eventDensity,
        replayCoverage,
        volatilityPenaltyApplied,
      },
      forecastVersion:        'v1',
      generatedAt,
      basedOnWindowDays:      [replay.windowDays],
      traceReferences,
      relatedEventIds,
      sourceTimelineIds,
      sourceMilestoneIds,
    };
  }

  static computeForOrgs(
    orgIds:    string[],
    replays:   Map<string, ContinuityReplay>,
    timelines: Map<string, OrganizationalTimeline>,
  ): ContinuityForecast[] {
    const results: ContinuityForecast[] = [];
    for (const orgId of orgIds) {
      const rep = replays.get(orgId);
      const tl  = timelines.get(orgId);
      if (!rep || !tl) continue;
      results.push(ContinuityForecastService.computeForOrg(rep, tl));
    }
    return results;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreToForecastState(score: number): ForecastContinuityState {
  if (score >= 85) return 'OPTIMIZING';
  if (score >= 65) return 'STABLE';
  if (score >= 40) return 'WATCHING';
  if (score >= 20) return 'FRAGMENTED';
  return 'CRITICAL';
}

function deriveTrend(scores: number[]): ForecastContinuityTrend {
  if (scores.length < 4) return 'STABLE';
  const mid      = Math.floor(scores.length / 2);
  const avg      = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const delta    = avg(scores.slice(mid)) - avg(scores.slice(0, mid));
  if (delta > 5)  return 'IMPROVING';
  if (delta < -5) return 'DECLINING';
  return 'STABLE';
}

function deriveAcceleration(scores: number[], oscillations: number): ContinuityAcceleration {
  if (oscillations >= 4)      return 'INCONSISTENT';
  if (scores.length < 6)      return 'LINEAR';

  const third   = Math.floor(scores.length / 3);
  const avg     = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const first   = avg(scores.slice(0, third));
  const second  = avg(scores.slice(third, 2 * third));
  const last    = avg(scores.slice(2 * third));
  const v1      = second - first;
  const v2      = last   - second;
  const accel   = v2 - v1;

  if (accel >  5) return 'ACCELERATING_RECOVERY';
  if (accel < -5) return 'ACCELERATING_DECLINE';
  return 'LINEAR';
}

function deriveEventDensity(eventCount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (eventCount >= 15) return 'HIGH';
  if (eventCount >= 5)  return 'MEDIUM';
  return 'LOW';
}

function stepDaysForWindow(windowDays: number): number {
  if (windowDays <= 7)   return 1;
  if (windowDays <= 30)  return 3;
  if (windowDays <= 90)  return 7;
  return 14;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function buildDrivingSignals(
  velocityPerDay:       number,
  replay:               ContinuityReplay,
  acceleration:         ContinuityAcceleration,
  divergence:           number,
): string[] {
  const signals: string[] = [];
  const perWeek = +(velocityPerDay * 7).toFixed(1);

  if (velocityPerDay > 0.5) {
    signals.push(`Proxy score trending upward at approximately ${perWeek} points per week.`);
  } else if (velocityPerDay < -0.5) {
    signals.push(`Proxy score declining at approximately ${Math.abs(perWeek)} points per week.`);
  } else {
    signals.push('Proxy score is stable with minimal directional movement.');
  }

  if (replay.historicalVolatility === 'HIGH') {
    signals.push('High historical volatility limits forecast certainty — projection is dampened.');
  } else if (replay.historicalVolatility === 'MODERATE') {
    signals.push('Moderate historical volatility detected — forecast carries reduced precision.');
  }

  if (acceleration === 'ACCELERATING_RECOVERY') {
    signals.push('Recovery momentum is increasing across observed windows.');
  } else if (acceleration === 'ACCELERATING_DECLINE') {
    signals.push('Decline momentum is increasing across observed windows.');
  }

  if (divergence >= 20) {
    signals.push(
      `Significant divergence between 30d and 90d projections (${divergence} points) — long-term trajectory carries additional uncertainty.`,
    );
  }

  const lastSnap = replay.snapshots.at(-1);
  if (lastSnap?.assertionsIn7d && lastSnap.assertionsIn7d > 0) {
    signals.push(
      `${lastSnap.assertionsIn7d} assertion event(s) detected in the most recent 7-day window.`,
    );
  }
  if (lastSnap && lastSnap.scansIn30d === 0) {
    signals.push('No scan activity in the most recent 30-day window — current score is inferred.');
  }

  return signals;
}
