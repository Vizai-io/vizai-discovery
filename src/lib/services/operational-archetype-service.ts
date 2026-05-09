/**
 * @fileOverview OperationalArchetypeService — Sprint 9 Task 3.
 *
 * Classifies each organization into one of 8 deterministic operational archetypes.
 * Pure function — no DB queries.
 *
 * Classification uses ordered priority (first-match-wins) to preserve:
 *   - Explainability (single clear primary signal)
 *   - Determinism (same inputs → same output always)
 *   - Replayability
 *
 * Priority order (highest to lowest):
 *   1. VOLATILE_OPERATOR         — oscillating + unstable forecast
 *   2. SILENT_DEGRADER           — declining + operational silence risk
 *   3. FRAGMENTING_ORGANIZATION  — projected fragmented + declining
 *   4. HIGH_INTERVENTION_ORG     — IMMEDIATE window + low effectiveness
 *   5. RESILIENT_GROWER          — resilient + recovering
 *   6. RECOVERY_ORIENTED         — recovering (non-UNSTABLE resilience)
 *   7. STABLE_OPERATOR           — stable/optimizing + stable forecast
 *   8. PLATEAUED_ORGANIZATION    — plateaued + weak momentum (default)
 *
 * Refinements:
 *   1:  archetypeStability — STABLE | TRANSITIONING | VOLATILE
 *   B:  previousArchetypes, transitionCount — derived from continuityAcceleration
 *   9:  generatedFromWindow
 *   E:  traceReferences, relatedEventIds, sourceOrganizationIds
 */

import type { ContinuityForecast }        from './continuity-forecast-service';
import type { ContinuityTrajectory }      from './continuity-trajectory-service';
import type { OperationalResilience }     from './operational-resilience-service';
import type { InterventionTimingInsight } from './intervention-timing-service';
import type { OperationalRiskForecast }   from './operational-risk-forecast-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OperationalArchetypeType =
  | 'STABLE_OPERATOR'
  | 'RECOVERY_ORIENTED'
  | 'FRAGMENTING_ORGANIZATION'
  | 'VOLATILE_OPERATOR'
  | 'SILENT_DEGRADER'
  | 'HIGH_INTERVENTION_ORG'
  | 'RESILIENT_GROWER'
  | 'PLATEAUED_ORGANIZATION';

export type ArchetypeConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type ArchetypeStability  = 'STABLE' | 'TRANSITIONING' | 'VOLATILE'; // Refinement 1

export interface OperationalArchetype {
  organizationId:      string;
  archetype:           OperationalArchetypeType;
  confidence:          ArchetypeConfidence;
  derivedFromSignals:  string[];
  archetypeStability:  ArchetypeStability;     // Refinement 1
  previousArchetypes:  string[];               // Refinement B
  transitionCount:     number;                 // Refinement B
  generatedFromWindow: { start: string; end: string }; // Refinement 9
  forecastVersion:     'v1';
  generatedAt:         string;
  traceReferences:     string[];               // Refinement E
  relatedEventIds:     string[];
  sourceOrganizationIds: string[];
}

// ── OperationalArchetypeService ───────────────────────────────────────────────

export class OperationalArchetypeService {
  /**
   * Classify a single organization into an operational archetype.
   * Pure function — no DB queries.
   */
  static classifyForOrg(
    forecast:    ContinuityForecast,
    trajectory:  ContinuityTrajectory,
    resilience:  OperationalResilience,
    timing:      InterventionTimingInsight,
    risk:        OperationalRiskForecast,
  ): OperationalArchetype {
    const generatedAt       = new Date().toISOString();
    const { organizationId } = forecast;

    // ── Priority classification ───────────────────────────────────────────────
    let archetype: OperationalArchetypeType;
    let primarySignal   = '';
    let secondarySignal = '';
    let primaryMatch    = true;
    let secondaryMatch  = false;

    if (
      trajectory.trajectoryType === 'OSCILLATING' &&
      forecast.forecastStability === 'UNSTABLE'
    ) {
      archetype       = 'VOLATILE_OPERATOR';
      primarySignal   = 'Oscillating continuity trajectory detected.';
      secondarySignal = 'Forecast stability classified as UNSTABLE.';
      secondaryMatch  = true;
    } else if (
      hasSilenceRisk(risk) &&
      trajectory.trajectoryType === 'DECLINING'
    ) {
      archetype       = 'SILENT_DEGRADER';
      primarySignal   = 'High-likelihood operational silence risk detected.';
      secondarySignal = 'Continuity trajectory is declining.';
      secondaryMatch  = true;
    } else if (
      (forecast.projectedState30d === 'FRAGMENTED' || forecast.projectedState30d === 'CRITICAL') &&
      trajectory.trajectoryType === 'DECLINING'
    ) {
      archetype       = 'FRAGMENTING_ORGANIZATION';
      primarySignal   = `Continuity projected to reach ${forecast.projectedState30d} state within 30 days.`;
      secondarySignal = 'Trajectory is on a declining path.';
      secondaryMatch  = true;
    } else if (
      timing.recommendedInterventionWindow === 'IMMEDIATE' &&
      timing.historicalEffectiveness === 'LOW'
    ) {
      archetype       = 'HIGH_INTERVENTION_ORG';
      primarySignal   = 'Immediate intervention recommended based on current state.';
      secondarySignal = 'Historical intervention effectiveness classified as LOW.';
      secondaryMatch  = true;
    } else if (
      resilience.resilienceState === 'RESILIENT' &&
      trajectory.trajectoryType === 'RECOVERING'
    ) {
      archetype       = 'RESILIENT_GROWER';
      primarySignal   = 'Resilience state classified as RESILIENT.';
      secondarySignal = 'Trajectory shows a RECOVERING directional pattern.';
      secondaryMatch  = true;
    } else if (
      trajectory.trajectoryType === 'RECOVERING' &&
      resilience.resilienceState !== 'UNSTABLE'
    ) {
      archetype       = 'RECOVERY_ORIENTED';
      primarySignal   = 'Trajectory shows a RECOVERING directional pattern.';
      secondarySignal = `Resilience state is ${resilience.resilienceState} (not UNSTABLE).`;
      secondaryMatch  = true;
    } else if (
      (forecast.currentState === 'STABLE' || forecast.currentState === 'OPTIMIZING') &&
      forecast.forecastStability === 'STABLE'
    ) {
      archetype       = 'STABLE_OPERATOR';
      primarySignal   = `Current continuity state is ${forecast.currentState}.`;
      secondarySignal = 'Forecast stability classified as STABLE.';
      secondaryMatch  = true;
    } else {
      archetype       = 'PLATEAUED_ORGANIZATION';
      primarySignal   = `Trajectory type: ${trajectory.trajectoryType}, momentum: ${trajectory.momentum}.`;
      primaryMatch    = trajectory.trajectoryType === 'PLATEAUED';
    }

    // ── Confidence ────────────────────────────────────────────────────────────
    const confidence: ArchetypeConfidence =
      (primaryMatch && secondaryMatch) ? 'HIGH'   :
      primaryMatch                     ? 'MEDIUM' :
      'LOW';

    // ── Derived signals ───────────────────────────────────────────────────────
    const derivedFromSignals = [
      primarySignal,
      secondarySignal,
      `Forecast confidence: ${forecast.confidence}.`,
      `Resilience score: ${resilience.resilienceScore}/100.`,
    ].filter(Boolean).slice(0, 4);

    // ── Previous archetype + transition (Refinement B) ────────────────────────
    const previousArchetype = inferPreviousArchetype(archetype, forecast.continuityAcceleration);
    const transitionCount   = previousArchetype !== archetype ? 1 : 0;

    // ── Archetype stability (Refinement 1) ────────────────────────────────────
    const archetypeStability: ArchetypeStability =
      (forecast.forecastStability === 'UNSTABLE' || forecast.continuityAcceleration === 'INCONSISTENT')
        ? 'VOLATILE' :
      (transitionCount > 0 ||
        forecast.continuityAcceleration === 'ACCELERATING_RECOVERY' ||
        forecast.continuityAcceleration === 'ACCELERATING_DECLINE')
        ? 'TRANSITIONING' :
      'STABLE';

    return {
      organizationId,
      archetype,
      confidence,
      derivedFromSignals,
      archetypeStability,
      previousArchetypes:    transitionCount > 0 ? [previousArchetype] : [],
      transitionCount,
      generatedFromWindow:   forecast.generatedFromWindow,
      forecastVersion:       'v1',
      generatedAt,
      traceReferences:       forecast.traceReferences.slice(0, 5),
      relatedEventIds:       forecast.relatedEventIds.slice(0, 10),
      sourceOrganizationIds: [organizationId],
    };
  }

  static classifyForOrgs(
    orgIds:       string[],
    forecasts:    Map<string, ContinuityForecast>,
    trajectories: Map<string, ContinuityTrajectory>,
    resiliences:  Map<string, OperationalResilience>,
    timings:      Map<string, InterventionTimingInsight>,
    risks:        Map<string, OperationalRiskForecast>,
  ): OperationalArchetype[] {
    const results: OperationalArchetype[] = [];
    for (const orgId of orgIds) {
      const f  = forecasts.get(orgId);
      const t  = trajectories.get(orgId);
      const r  = resiliences.get(orgId);
      const ti = timings.get(orgId);
      const ri = risks.get(orgId);
      if (!f || !t || !r || !ti || !ri) continue;
      results.push(OperationalArchetypeService.classifyForOrg(f, t, r, ti, ri));
    }
    return results;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasSilenceRisk(risk: OperationalRiskForecast): boolean {
  return risk.projectedRisks.some(
    (r) => r.riskType === 'OPERATIONAL_SILENCE' && r.likelihood === 'HIGH',
  );
}

function inferPreviousArchetype(
  current:      OperationalArchetypeType,
  acceleration: string,
): OperationalArchetypeType {
  // If no directional change, archetype was the same
  if (acceleration === 'LINEAR' || acceleration === 'INCONSISTENT') return current;

  // "Better before" (current is worse due to acceleration decline)
  const betterMap: Record<OperationalArchetypeType, OperationalArchetypeType> = {
    FRAGMENTING_ORGANIZATION: 'RECOVERY_ORIENTED',
    VOLATILE_OPERATOR:        'STABLE_OPERATOR',
    SILENT_DEGRADER:          'PLATEAUED_ORGANIZATION',
    HIGH_INTERVENTION_ORG:    'RECOVERY_ORIENTED',
    RECOVERY_ORIENTED:        'RESILIENT_GROWER',
    PLATEAUED_ORGANIZATION:   'STABLE_OPERATOR',
    STABLE_OPERATOR:          'STABLE_OPERATOR',
    RESILIENT_GROWER:         'RESILIENT_GROWER',
  };

  // "Worse before" (current is better due to recovery acceleration)
  const worseMap: Record<OperationalArchetypeType, OperationalArchetypeType> = {
    RESILIENT_GROWER:         'RECOVERY_ORIENTED',
    STABLE_OPERATOR:          'PLATEAUED_ORGANIZATION',
    RECOVERY_ORIENTED:        'FRAGMENTING_ORGANIZATION',
    PLATEAUED_ORGANIZATION:   'SILENT_DEGRADER',
    FRAGMENTING_ORGANIZATION: 'VOLATILE_OPERATOR',
    VOLATILE_OPERATOR:        'VOLATILE_OPERATOR',
    SILENT_DEGRADER:          'SILENT_DEGRADER',
    HIGH_INTERVENTION_ORG:    'HIGH_INTERVENTION_ORG',
  };

  if (acceleration === 'ACCELERATING_DECLINE') return betterMap[current];
  return worseMap[current];
}
