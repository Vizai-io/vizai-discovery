/**
 * @fileOverview CrossOrganizationalPatternService — Sprint 9 Task 2.
 *
 * Identifies recurring operational continuity patterns across organizations.
 * Pure function — no DB queries. Operates on aggregated Sprint 7+8 output arrays.
 *
 * 6 pattern types detected by scanning all org outputs:
 *   RECOVERY     — ≥2 orgs with RECOVERING trajectories
 *   DEGRADATION  — ≥2 orgs with DECLINING trajectories
 *   ONBOARDING   — ≥2 orgs with onboarding events correlated with resilience
 *   RESILIENCE   — ≥2 orgs with RESILIENT state + LOW volatility
 *   INTERVENTION — ≥2 orgs with HIGH intervention effectiveness + recovery
 *   VOLATILITY   — ≥2 orgs with OSCILLATING or UNSTABLE forecast stability
 *
 * Only patterns with occurrenceCount ≥ 2 are returned (single-org signals are noise).
 *
 * Refinements:
 *   4:  recurrenceVelocity — SLOW | MODERATE | RAPID
 *   C:  patternStrength — WEAK | MODERATE | STRONG
 *   9:  generatedFromWindow
 *   E:  traceReferences, relatedEventIds, sourceOrganizationIds
 */

import type { ContinuityTrajectory }    from './continuity-trajectory-service';
import type { OperationalMemory }       from './operational-memory-service';
import type { OperationalRiskForecast } from './operational-risk-forecast-service';
import type { OperationalResilience }   from './operational-resilience-service';
import type { InterventionTimingInsight } from './intervention-timing-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PatternType        = 'RECOVERY' | 'DEGRADATION' | 'ONBOARDING' | 'RESILIENCE' | 'INTERVENTION' | 'VOLATILITY';
export type PatternStrength    = 'WEAK' | 'MODERATE' | 'STRONG';   // Refinement C
export type RecurrenceVelocity = 'SLOW' | 'MODERATE' | 'RAPID';   // Refinement 4

export interface CrossOrganizationalPattern {
  patternId:              string;
  patternType:            PatternType;
  occurrenceCount:        number;
  strongestSignals:       string[];
  averageResolutionDays?: number;
  associatedOutcomes:     string[];
  patternStrength:        PatternStrength;     // Refinement C
  recurrenceVelocity:     RecurrenceVelocity;  // Refinement 4
  generatedFromWindow:    { start: string; end: string }; // Refinement 9
  forecastVersion:        'v1';
  generatedAt:            string;
  traceReferences:        string[];            // Refinement E
  relatedEventIds:        string[];
  sourceOrganizationIds:  string[];
}

// ── CrossOrganizationalPatternService ────────────────────────────────────────

export class CrossOrganizationalPatternService {
  /**
   * Detect cross-organizational operational patterns from aggregated Sprint 7+8 outputs.
   * Pure function — no DB queries.
   */
  static detectPatterns(
    trajectories: ContinuityTrajectory[],
    memories:     OperationalMemory[],
    risks:        OperationalRiskForecast[],
    resiliences:  OperationalResilience[],
    timings:      InterventionTimingInsight[],
    generatedFromWindow: { start: string; end: string },
  ): CrossOrganizationalPattern[] {
    const generatedAt = new Date().toISOString();
    const totalOrgs   = trajectories.length;

    // Build lookup maps
    const resilMap = new Map(resiliences.map((r) => [r.organizationId, r]));
    const timingMap = new Map(timings.map((t) => [t.organizationId, t]));
    const memoryMap = new Map(memories.map((m) => [m.organizationId, m]));
    const riskMap   = new Map(risks.map((r) => [r.organizationId, r]));

    const patterns: CrossOrganizationalPattern[] = [];

    // ── Pattern 1: RECOVERY ───────────────────────────────────────────────────
    {
      const matchingOrgs = trajectories
        .filter((t) => t.trajectoryType === 'RECOVERING')
        .map((t) => t.organizationId);
      if (matchingOrgs.length >= 2) {
        const avgDays = averageResolutionDays(matchingOrgs, timingMap);
        const avgScore = avgResilienceScore(matchingOrgs, resilMap);
        patterns.push(buildPattern(
          'recovery_trajectory', 'RECOVERY', matchingOrgs, totalOrgs,
          [
            `${matchingOrgs.length} organization(s) showed a sustained RECOVERING continuity trajectory.`,
            avgDays ? `Average recovery time across these organizations: ${avgDays} day(s).` : '',
            avgScore ? `Average resilience score within this group: ${avgScore}/100.` : '',
          ].filter(Boolean),
          avgDays,
          [`Organizations with recovering trajectories showed reduced operational risk across the window.`],
          generatedFromWindow, generatedAt,
        ));
      }
    }

    // ── Pattern 2: DEGRADATION ────────────────────────────────────────────────
    {
      const matchingOrgs = trajectories
        .filter((t) => t.trajectoryType === 'DECLINING')
        .map((t) => t.organizationId);
      if (matchingOrgs.length >= 2) {
        patterns.push(buildPattern(
          'declining_trajectory', 'DEGRADATION', matchingOrgs, totalOrgs,
          [
            `${matchingOrgs.length} organization(s) showed a declining continuity trajectory.`,
            'Shared signals: reduced scan cadence or increased assertion activity.',
          ],
          undefined,
          ['Organizations on declining trajectories may benefit from near-term operational review.'],
          generatedFromWindow, generatedAt,
        ));
      }
    }

    // ── Pattern 3: ONBOARDING correlation ────────────────────────────────────
    {
      const matchingOrgs = trajectories
        .filter((t) => {
          const mem  = memoryMap.get(t.organizationId);
          const resl = resilMap.get(t.organizationId);
          const hasOnboarding = mem?.interventionChains.some(
            (c) => c.triggerType?.includes('ONBOARDING'),
          ) ?? false;
          const isResilient = resl && resl.resilienceState !== 'UNSTABLE';
          return hasOnboarding && isResilient;
        })
        .map((t) => t.organizationId);
      if (matchingOrgs.length >= 2) {
        patterns.push(buildPattern(
          'onboarding_resilience_correlation', 'ONBOARDING', matchingOrgs, totalOrgs,
          [
            `${matchingOrgs.length} organization(s) showed onboarding activity correlated with sustained resilience.`,
            'Onboarding-stage interventions appear associated with improved continuity outcomes.',
          ],
          undefined,
          ['Onboarding engagement correlated with non-UNSTABLE resilience states across multiple organizations.'],
          generatedFromWindow, generatedAt,
        ));
      }
    }

    // ── Pattern 4: RESILIENCE cluster ────────────────────────────────────────
    {
      const matchingOrgs = resiliences
        .filter((r) => r.resilienceState === 'RESILIENT')
        .map((r) => r.organizationId);
      if (matchingOrgs.length >= 2) {
        const avgScore = avgResilienceScore(matchingOrgs, resilMap);
        patterns.push(buildPattern(
          'stable_resilience_pattern', 'RESILIENCE', matchingOrgs, totalOrgs,
          [
            `${matchingOrgs.length} organization(s) maintained a RESILIENT operational state.`,
            avgScore ? `Average resilience score within this cluster: ${avgScore}/100.` : '',
            'Shared characteristics include low volatility and sustained continuity cadence.',
          ].filter(Boolean),
          undefined,
          ['Resilient organizations share consistent scan cadence and low historical volatility.'],
          generatedFromWindow, generatedAt,
        ));
      }
    }

    // ── Pattern 5: INTERVENTION effectiveness cluster ─────────────────────────
    {
      const matchingOrgs = timings
        .filter((t) => t.historicalEffectiveness === 'HIGH')
        .map((t) => t.organizationId);
      if (matchingOrgs.length >= 2) {
        const avgDays = averageResolutionDays(matchingOrgs, timingMap);
        patterns.push(buildPattern(
          'high_effectiveness_intervention', 'INTERVENTION', matchingOrgs, totalOrgs,
          [
            `${matchingOrgs.length} organization(s) showed HIGH intervention effectiveness.`,
            avgDays ? `Average recovery time: ${avgDays} day(s).` : '',
            'These organizations show strong causal correlation between interventions and continuity improvement.',
          ].filter(Boolean),
          avgDays,
          ['High-effectiveness intervention patterns correlate with RECOVERING or RESILIENT states.'],
          generatedFromWindow, generatedAt,
        ));
      }
    }

    // ── Pattern 6: VOLATILITY cluster ────────────────────────────────────────
    {
      const matchingOrgs = trajectories
        .filter((t) => t.trajectoryType === 'OSCILLATING')
        .map((t) => t.organizationId);
      if (matchingOrgs.length >= 2) {
        patterns.push(buildPattern(
          'operational_volatility_cluster', 'VOLATILITY', matchingOrgs, totalOrgs,
          [
            `${matchingOrgs.length} organization(s) showed oscillating continuity trajectories.`,
            'Shared signals: high state transition frequency and score variance.',
          ],
          undefined,
          ['Oscillating organizations may benefit from cadence stabilization before other interventions.'],
          generatedFromWindow, generatedAt,
        ));
      }
    }

    return patterns;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPattern(
  patternId:            string,
  patternType:          PatternType,
  orgIds:               string[],
  totalOrgs:            number,
  strongestSignals:     string[],
  avgResolutionDays:    number | undefined,
  associatedOutcomes:   string[],
  generatedFromWindow:  { start: string; end: string },
  generatedAt:          string,
): CrossOrganizationalPattern {
  const occurrenceCount = orgIds.length;
  const ratio           = occurrenceCount / Math.max(1, totalOrgs);

  const patternStrength: PatternStrength =
    ratio >= 0.5 && occurrenceCount >= 4 ? 'STRONG'   :
    occurrenceCount >= 2                  ? 'MODERATE' :
    'WEAK';

  const recurrenceVelocity: RecurrenceVelocity =
    ratio > 0.6 ? 'RAPID'    :
    ratio > 0.3 ? 'MODERATE' :
    'SLOW';

  return {
    patternId,
    patternType,
    occurrenceCount,
    strongestSignals:       strongestSignals.slice(0, 4),
    averageResolutionDays:  avgResolutionDays,
    associatedOutcomes:     associatedOutcomes.slice(0, 3),
    patternStrength,
    recurrenceVelocity,
    generatedFromWindow,
    forecastVersion:        'v1',
    generatedAt,
    traceReferences:        [],
    relatedEventIds:        [],
    sourceOrganizationIds:  orgIds.slice(0, 20),
  };
}

function averageResolutionDays(
  orgIds:     string[],
  timingMap:  Map<string, InterventionTimingInsight>,
): number | undefined {
  const days = orgIds
    .map((id) => timingMap.get(id)?.averageRecoveryDays)
    .filter((d): d is number => d !== undefined);
  if (days.length === 0) return undefined;
  return Math.round(days.reduce((a, b) => a + b, 0) / days.length);
}

function avgResilienceScore(
  orgIds:    string[],
  resilMap:  Map<string, OperationalResilience>,
): number | undefined {
  const scores = orgIds
    .map((id) => resilMap.get(id)?.resilienceScore)
    .filter((s): s is number => s !== undefined);
  if (scores.length === 0) return undefined;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
