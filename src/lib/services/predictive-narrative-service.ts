/**
 * @fileOverview PredictiveNarrativeService — Sprint 8 Task 6.
 *
 * Generates deterministic, template-based operational forecasting summaries.
 * No LLM. No generative AI. No opaque synthesis.
 *
 * All forecast summaries are constructed from observable operational facts:
 *   - Current and projected states
 *   - Trajectory type and momentum
 *   - Resilience state and score
 *   - Risk level and strongest indicators
 *   - Intervention timing posture
 *
 * Language restrictions (Refinement 6 / Refinement D):
 *   PROHIBITED: "likely collapse", "catastrophic decline", "major operational failure",
 *               "high probability crisis", "imminent breakdown"
 *   PREFERRED: calm factual operational descriptions of observed patterns and projections
 *
 * Refinements:
 *   6:  Language restrictions — prohibited dramatic phrasing
 *   7:  forecastMemoryQuality — forwarded from forecast
 *   9:  generatedFromWindow
 *   C:  forecastVersion, generatedAt, basedOnWindowDays
 *   D:  calm forecasting philosophy throughout
 *   E:  traceReferences, relatedEventIds, sourceTimelineIds, sourceMilestoneIds
 *   F:  advisory only — no mutations, no autonomous behavior
 */

import type { ContinuityForecast }          from './continuity-forecast-service';
import type { ContinuityTrajectory }        from './continuity-trajectory-service';
import type { OperationalResilience }       from './operational-resilience-service';
import type { InterventionTimingInsight }   from './intervention-timing-service';
import type { OperationalRiskForecast }     from './operational-risk-forecast-service';
import type { ForecastMemoryQuality }       from './continuity-forecast-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectedContinuityDirection = 'IMPROVING' | 'STABLE' | 'DECLINING';
export type PredictiveNarrativeSource    =
  | 'FORECAST'
  | 'TRAJECTORY'
  | 'RESILIENCE'
  | 'RISK'
  | 'TIMING';

export interface PredictiveNarrative {
  organizationId:                 string;
  forecastSummary:                string;
  strongestForecastSignals:       string[];
  strongestProtectiveSignals:     string[];
  projectedContinuityDirection:   ProjectedContinuityDirection;
  generatedFrom:                  PredictiveNarrativeSource;
  forecastMemoryQuality:          ForecastMemoryQuality;     // Refinement 7
  generatedFromWindow:            { start: string; end: string }; // Refinement 9
  forecastVersion:                'v1';                      // Refinement C
  generatedAt:                    string;
  basedOnWindowDays:              number[];
  traceReferences:                string[];                  // Refinement E
  relatedEventIds:                string[];
  sourceTimelineIds:              string[];
  sourceMilestoneIds:             string[];
}

// ── PredictiveNarrativeService ────────────────────────────────────────────────

export class PredictiveNarrativeService {
  /**
   * Generate a deterministic operational forecast narrative for a single organization.
   * Pure function — no DB queries.
   */
  static generateForOrg(
    forecast:   ContinuityForecast,
    trajectory: ContinuityTrajectory,
    resilience: OperationalResilience,
    timing:     InterventionTimingInsight,
    risk:       OperationalRiskForecast,
    orgName:    string,
  ): PredictiveNarrative {
    const generatedAt = new Date().toISOString();
    const { organizationId } = forecast;

    // ── Projected continuity direction ────────────────────────────────────────
    const projectedContinuityDirection: ProjectedContinuityDirection =
      forecast.continuityTrend === 'IMPROVING' ? 'IMPROVING' :
      forecast.continuityTrend === 'DECLINING' ? 'DECLINING' :
      'STABLE';

    // ── Forecast summary (3-sentence template — Refinement 6/D) ──────────────
    const forecastSummary = buildForecastSummary(
      orgName, forecast, trajectory, resilience, risk,
    );

    // ── Primary source (priority: RISK > TRAJECTORY > RESILIENCE > FORECAST > TIMING) ──
    const generatedFrom: PredictiveNarrativeSource =
      (risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL') ? 'RISK'        :
      trajectory.trajectoryType !== 'STABLE' && trajectory.trajectoryType !== 'PLATEAUED'
        ? 'TRAJECTORY' :
      (resilience.resilienceState === 'UNSTABLE' || resilience.resilienceState === 'FRAGILE')
        ? 'RESILIENCE'  :
      'FORECAST';

    // ── Strongest forecast signals ────────────────────────────────────────────
    const strongestForecastSignals = [
      ...risk.strongestIndicators,
      ...forecast.drivingSignals,
    ].filter(Boolean).slice(0, 5);

    // ── Strongest protective signals ──────────────────────────────────────────
    const strongestProtectiveSignals = [
      ...resilience.strongestProtectiveFactors,
    ].filter(Boolean).slice(0, 5);

    // ── Lineage (Refinement E) ────────────────────────────────────────────────
    const traceReferences = [
      ...forecast.traceReferences,
      ...risk.traceReferences,
    ].slice(0, 10);
    const relatedEventIds = [
      ...forecast.relatedEventIds,
      ...risk.relatedEventIds,
    ].slice(0, 20);

    return {
      organizationId,
      forecastSummary,
      strongestForecastSignals:   [...new Set(strongestForecastSignals)],
      strongestProtectiveSignals: [...new Set(strongestProtectiveSignals)],
      projectedContinuityDirection,
      generatedFrom,
      forecastMemoryQuality:      forecast.forecastMemoryQuality,
      generatedFromWindow:        forecast.generatedFromWindow,
      forecastVersion:            'v1',
      generatedAt,
      basedOnWindowDays:          forecast.basedOnWindowDays,
      traceReferences,
      relatedEventIds,
      sourceTimelineIds:          forecast.sourceTimelineIds,
      sourceMilestoneIds:         forecast.sourceMilestoneIds,
    };
  }

  static generateForOrgs(
    orgIds:       string[],
    forecasts:    Map<string, ContinuityForecast>,
    trajectories: Map<string, ContinuityTrajectory>,
    resiliences:  Map<string, OperationalResilience>,
    timings:      Map<string, InterventionTimingInsight>,
    risks:        Map<string, OperationalRiskForecast>,
    orgNames:     Map<string, string>,
  ): PredictiveNarrative[] {
    const results: PredictiveNarrative[] = [];
    for (const orgId of orgIds) {
      const f  = forecasts.get(orgId);
      const t  = trajectories.get(orgId);
      const r  = resiliences.get(orgId);
      const ti = timings.get(orgId);
      const ri = risks.get(orgId);
      if (!f || !t || !r || !ti || !ri) continue;
      const name = orgNames.get(orgId) ?? orgId;
      results.push(PredictiveNarrativeService.generateForOrg(f, t, r, ti, ri, name));
    }
    return results;
  }
}

// ── Template builders (Refinement 6 — calm language) ─────────────────────────

function buildForecastSummary(
  orgName:    string,
  forecast:   ContinuityForecast,
  trajectory: ContinuityTrajectory,
  resilience: OperationalResilience,
  risk:       OperationalRiskForecast,
): string {
  const parts: string[] = [];

  // Sentence 1: Current state and trajectory
  parts.push(
    `${orgName} is currently in a ${formatState(forecast.currentState)} continuity state ` +
    `with a ${trajectory.trajectoryType.toLowerCase()} trajectory ` +
    `and ${trajectory.momentum.toLowerCase()} momentum.`,
  );

  // Sentence 2: 30d and 90d projection (calm — no dramatization)
  if (forecast.projectedState30d === forecast.projectedState90d) {
    parts.push(
      `Operational continuity is projected to remain ${formatState(forecast.projectedState30d)} ` +
      `across both the 30-day and 90-day forecast windows.`,
    );
  } else {
    parts.push(
      `Operational continuity is projected to be ${formatState(forecast.projectedState30d)} ` +
      `over the next 30 days, and ${formatState(forecast.projectedState90d)} over the 90-day window.`,
    );
  }

  // Sentence 3: Risk or resilience context (calm language — Refinement 6)
  if (risk.riskLevel === 'CRITICAL' || risk.riskLevel === 'HIGH') {
    const topRisk = risk.projectedRisks[0];
    if (topRisk) {
      parts.push(
        `Current operational patterns suggest elevated risk in the ${topRisk.riskType.toLowerCase().replace(/_/g, ' ')} category — ` +
        `monitoring and early intervention are advisable.`,
      );
    } else {
      parts.push(
        'Current operational patterns suggest increased continuity risk — monitoring is advisable.',
      );
    }
  } else if (resilience.resilienceState === 'RESILIENT') {
    parts.push(
      `Organizational resilience indicators are favorable (score: ${resilience.resilienceScore}/100), ` +
      `with consistent continuity patterns observed over the window.`,
    );
  } else if (resilience.resilienceState === 'RECOVERING') {
    parts.push(
      `Operational patterns show signs of recovery — resilience score is ${resilience.resilienceScore}/100, ` +
      `with continuity indicators trending in a positive direction.`,
    );
  } else {
    parts.push(
      `Resilience score is ${resilience.resilienceScore}/100 — continued operational cadence is the recommended posture.`,
    );
  }

  return parts.join(' ');
}

function formatState(state: string): string {
  const labels: Record<string, string> = {
    OPTIMIZING: 'optimizing',
    STABLE:     'stable',
    WATCHING:   'watching',
    FRAGMENTED: 'fragmented',
    CRITICAL:   'at an elevated concern level',
  };
  return labels[state] ?? state.toLowerCase();
}
