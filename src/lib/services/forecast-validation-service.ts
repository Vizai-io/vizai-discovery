/**
 * @fileOverview ForecastValidationService — Sprint 9 Task 1.
 *
 * Validates historical forecast accuracy using replay-split methodology.
 * No persistence required — fully deterministic from existing replay data.
 *
 * Replay-split methodology:
 *   1. Split replay snapshots at midpoint (floor(N/2))
 *   2. Compute historical velocity from first-half scores
 *   3. Project predicted state at +30d from the historical midpoint
 *   4. Compare against actual state at midpoint+30d in the full replay
 *   5. Score validation result, confidence accuracy, and calibration
 *
 * State taxonomy (5-state — aligned with ContinuityForecastService):
 *   ≥85 → OPTIMIZING | ≥65 → STABLE | ≥40 → WATCHING | ≥20 → FRAGMENTED | <20 → CRITICAL
 *
 * Refinements:
 *   3:  forecastCalibration — WELL_CALIBRATED | OVERCALIBRATED | UNDERCALIBRATED
 *   7:  forecastDriftTrend on CollectiveNarrative (platform-level aggregate)
 *   9:  generatedFromWindow
 *   A:  validationIntegrity — replayCoverage, historicalWindowComplete, confidencePenaltyApplied
 *   E:  traceReferences, relatedEventIds, sourceOrganizationIds
 *   G:  HIGH volatility relaxes INACCURATE threshold (leniency in volatile windows)
 */

import type { ContinuityReplay }    from './continuity-replay-service';
import type { ContinuityForecast }  from './continuity-forecast-service';
import type { OrganizationalTimeline } from './organizational-timeline-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ValidationResult      = 'ACCURATE' | 'PARTIALLY_ACCURATE' | 'INACCURATE';
export type ConfidenceAccuracy    = 'VALIDATED' | 'OVERCONFIDENT' | 'UNDERCONFIDENT';
export type ForecastCalibration   = 'WELL_CALIBRATED' | 'OVERCALIBRATED' | 'UNDERCALIBRATED'; // Refinement 3

export interface ValidationIntegrity {                    // Refinement A
  replayCoverage:           'SPARSE' | 'MODERATE' | 'RICH';
  historicalWindowComplete: boolean;
  confidencePenaltyApplied: boolean;
}

export interface ForecastValidation {
  organizationId:         string;
  validationWindowDays:   30 | 90;
  predictedState:         string;
  actualState:            string;
  validationResult:       ValidationResult;
  confidenceAccuracy:     ConfidenceAccuracy;
  divergenceScore:        number;                         // 0–100
  forecastCalibration:    ForecastCalibration;            // Refinement 3
  validationIntegrity:    ValidationIntegrity;            // Refinement A
  generatedFromWindow:    { start: string; end: string }; // Refinement 9
  forecastVersion:        'v1';
  generatedAt:            string;
  traceReferences:        string[];                       // Refinement E
  relatedEventIds:        string[];
  sourceOrganizationIds:  string[];
}

// ── ForecastValidationService ─────────────────────────────────────────────────

export class ForecastValidationService {
  /**
   * Validate a historical forecast for a single organization.
   * Pure function — no DB queries.
   *
   * Uses replay-split methodology: splits the replay snapshot array at the
   * midpoint, computes a "what would have been predicted" velocity from the
   * first half, and compares against the actual state in the second half.
   */
  static validateForOrg(
    replay:   ContinuityReplay,
    forecast: ContinuityForecast,
    _timeline: OrganizationalTimeline,
  ): ForecastValidation {
    const generatedAt      = new Date().toISOString();
    const { organizationId } = replay;
    const scores           = replay.snapshots.map((s) => s.proxyScore);
    const n                = scores.length;
    const stepDays         = stepDaysForWindow(replay.windowDays);

    // ── Integrity flags ───────────────────────────────────────────────────────
    const replayCoverage: 'SPARSE' | 'MODERATE' | 'RICH' =
      n >= 10 ? 'RICH' : n >= 6 ? 'MODERATE' : 'SPARSE';
    const mid                    = Math.floor(n / 2);
    const historicalWindowComplete = mid >= 3;

    // ── Sparse fallback ───────────────────────────────────────────────────────
    if (n < 6 || !historicalWindowComplete) {
      return sparseResult(
        organizationId, forecast, replay, replayCoverage, generatedAt,
      );
    }

    // ── Historical velocity from first half ───────────────────────────────────
    const historicalScores = scores.slice(0, mid);
    const window6          = historicalScores.slice(-6);
    const rawVelocity      = window6.length >= 2
      ? (window6[window6.length - 1] - window6[0]) / (window6.length - 1)
      : 0;

    // Volatility in historical window (Refinement G)
    const histVariance        = computeVariance(historicalScores);
    const histOscillations    = countStateOscillations(historicalScores);
    const highVolatility      = histOscillations >= 4 || histVariance > 400;
    const confidencePenaltyApplied = highVolatility;
    const effectiveVelocity   = highVolatility ? rawVelocity * 0.4 : rawVelocity;
    const velocityPerDay      = effectiveVelocity / Math.max(1, stepDays);

    // ── Predicted state at +30d ───────────────────────────────────────────────
    const latestHistorical = historicalScores[mid - 1];
    const predictedScore   = clamp(Math.round(latestHistorical + velocityPerDay * 30), 0, 100);
    const predictedState   = scoreToForecastState(predictedScore);

    // ── Actual state at +30d in full replay ───────────────────────────────────
    const stepsFor30d = Math.max(1, Math.floor(30 / Math.max(1, stepDays)));
    const actualIdx   = Math.min(mid + stepsFor30d - 1, n - 1);
    const actualScore = scores[actualIdx];
    const actualState = scoreToForecastState(actualScore);

    // ── Validation result (Refinement G — lenient under high volatility) ──────
    const rankDelta        = Math.abs(stateRank(predictedState) - stateRank(actualState));
    const accurateThreshold = highVolatility ? 2 : 1;
    const partialThreshold  = highVolatility ? 3 : 2;

    const validationResult: ValidationResult =
      rankDelta <= accurateThreshold ? 'ACCURATE'          :
      rankDelta <= partialThreshold  ? 'PARTIALLY_ACCURATE':
      'INACCURATE';

    // ── Divergence score ──────────────────────────────────────────────────────
    const divergenceScore = Math.min(100, rankDelta * 25);

    // ── Confidence accuracy ───────────────────────────────────────────────────
    const originalConfidence = forecast.confidence;
    const confidenceAccuracy: ConfidenceAccuracy =
      (originalConfidence === 'HIGH' && validationResult === 'INACCURATE' && !confidencePenaltyApplied)
        ? 'OVERCONFIDENT' :
      (originalConfidence === 'LOW' && validationResult === 'ACCURATE')
        ? 'UNDERCONFIDENT' :
      'VALIDATED';

    // ── Forecast calibration (Refinement 3) ───────────────────────────────────
    const forecastCalibration: ForecastCalibration =
      confidenceAccuracy === 'OVERCONFIDENT'   ? 'OVERCALIBRATED'   :
      confidenceAccuracy === 'UNDERCONFIDENT'  ? 'UNDERCALIBRATED'  :
      'WELL_CALIBRATED';

    return {
      organizationId,
      validationWindowDays:    30,
      predictedState,
      actualState,
      validationResult,
      confidenceAccuracy,
      divergenceScore,
      forecastCalibration,
      validationIntegrity: {
        replayCoverage,
        historicalWindowComplete: true,
        confidencePenaltyApplied,
      },
      generatedFromWindow:  replay.generatedFromWindow,
      forecastVersion:      'v1',
      generatedAt,
      traceReferences:      replay.traceReferences.slice(0, 5),
      relatedEventIds:      replay.relatedEventIds.slice(0, 10),
      sourceOrganizationIds: [organizationId],
    };
  }

  static validateForOrgs(
    orgIds:    string[],
    replays:   Map<string, ContinuityReplay>,
    forecasts: Map<string, ContinuityForecast>,
    timelines: Map<string, OrganizationalTimeline>,
  ): ForecastValidation[] {
    const results: ForecastValidation[] = [];
    for (const orgId of orgIds) {
      const rep = replays.get(orgId);
      const fc  = forecasts.get(orgId);
      const tl  = timelines.get(orgId);
      if (!rep || !fc || !tl) continue;
      results.push(ForecastValidationService.validateForOrg(rep, fc, tl));
    }
    return results;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreToForecastState(score: number): string {
  if (score >= 85) return 'OPTIMIZING';
  if (score >= 65) return 'STABLE';
  if (score >= 40) return 'WATCHING';
  if (score >= 20) return 'FRAGMENTED';
  return 'CRITICAL';
}

function stateRank(state: string): number {
  const ranks: Record<string, number> = {
    OPTIMIZING: 4, STABLE: 3, WATCHING: 2, FRAGMENTED: 1, CRITICAL: 0,
  };
  return ranks[state] ?? 2;
}

function stepDaysForWindow(windowDays: number): number {
  if (windowDays <= 7)  return 1;
  if (windowDays <= 30) return 3;
  if (windowDays <= 90) return 7;
  return 14;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function computeVariance(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return scores.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / scores.length;
}

function countStateOscillations(scores: number[]): number {
  let count = 0;
  for (let i = 1; i < scores.length; i++) {
    const prev = scoreToForecastState(scores[i - 1]);
    const curr = scoreToForecastState(scores[i]);
    if (prev !== curr) count++;
  }
  return count;
}

function sparseResult(
  organizationId: string,
  forecast:       ContinuityForecast,
  replay:         ContinuityReplay,
  replayCoverage: 'SPARSE' | 'MODERATE' | 'RICH',
  generatedAt:    string,
): ForecastValidation {
  return {
    organizationId,
    validationWindowDays:   30,
    predictedState:         forecast.currentState,
    actualState:            forecast.currentState,
    validationResult:       'PARTIALLY_ACCURATE',
    confidenceAccuracy:     'UNDERCONFIDENT',
    divergenceScore:        0,
    forecastCalibration:    'UNDERCALIBRATED',
    validationIntegrity: {
      replayCoverage,
      historicalWindowComplete: false,
      confidencePenaltyApplied: false,
    },
    generatedFromWindow:    replay.generatedFromWindow,
    forecastVersion:        'v1',
    generatedAt,
    traceReferences:        replay.traceReferences.slice(0, 5),
    relatedEventIds:        replay.relatedEventIds.slice(0, 10),
    sourceOrganizationIds:  [organizationId],
  };
}
