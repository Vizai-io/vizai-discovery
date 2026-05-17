/**
 * @fileOverview CollectiveOperationalNarrativeService — Sprint 9 Task 6.
 *
 * Synthesizes all Sprint 9 intelligence outputs into a single platform-level
 * operational narrative. Pure function — no DB queries.
 *
 * Aggregates across:
 *   - ForecastValidation[]      — accuracy rates → forecastDriftTrend (Refinement 7)
 *   - CrossOrganizationalPattern[] — most prevalent cross-org signals
 *   - OperationalArchetype[]    — platform archetype distribution
 *   - InterventionBenchmark[]   — top intervention type by effectiveness
 *   - ResilienceBenchmark[]     — resilience by archetype group
 *
 * overallPlatformState:
 *   STABLE    — healthy archetypes outnumber at-risk ≥ 2:1
 *   MIXED     — healthy and at-risk archetypes roughly balanced
 *   AT_RISK   — at-risk archetypes outnumber healthy
 *   DEGRADING — majority are declining archetypes (FRAGMENTING/SILENT_DEGRADER)
 *
 * forecastDriftTrend (Refinement 7):
 *   IMPROVING  — ≥60% of validations ACCURATE
 *   STABLE     — 40–59% ACCURATE
 *   DEGRADING  — <40% ACCURATE
 *
 * platformIntelligenceDensity:
 *   RICH     — patternsDetected ≥ 3 AND validationsComplete ≥ 5
 *   MODERATE — patternsDetected ≥ 2 OR validationsComplete ≥ 3
 *   SPARSE   — otherwise
 *
 * Refinements:
 *   7:  forecastDriftTrend — platform-level forecast accuracy trend
 *   9:  generatedFromWindow
 *   E:  traceReferences, relatedEventIds, sourceOrganizationIds
 */

import type { ForecastValidation }         from './forecast-validation-service';
import type { CrossOrganizationalPattern } from './cross-organizational-pattern-service';
import type { OperationalArchetype }       from './operational-archetype-service';
import type { InterventionBenchmark }      from './intervention-benchmark-service';
import type { ResilienceBenchmark }        from './resilience-benchmark-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OverallPlatformState      = 'STABLE' | 'MIXED' | 'AT_RISK' | 'DEGRADING';
export type ForecastDriftTrend        = 'IMPROVING' | 'STABLE' | 'DEGRADING';   // Refinement 7
export type PlatformIntelligenceDensity = 'RICH' | 'MODERATE' | 'SPARSE';

export interface CollectiveOperationalNarrative {
  platformNarrative:           string;
  overallPlatformState:        OverallPlatformState;
  forecastDriftTrend:          ForecastDriftTrend;         // Refinement 7
  platformIntelligenceDensity: PlatformIntelligenceDensity;
  organizationsAnalyzed:       number;
  validationsComplete:         number;
  patternsDetected:            number;
  dominantArchetype:           string;
  dominantPatternType:         string | undefined;
  topInterventionType:         string | undefined;
  archetypeDistribution:       Record<string, number>;
  validationAccuracyRate:      number;                     // 0.0–1.0
  generatedFromWindow:         { start: string; end: string }; // Refinement 9
  forecastVersion:             'v1';
  generatedAt:                 string;
  traceReferences:             string[];                   // Refinement E
  relatedEventIds:             string[];
  sourceOrganizationIds:       string[];
}

// ── At-risk archetype classification ─────────────────────────────────────────

const AT_RISK_ARCHETYPES = new Set([
  'FRAGMENTING_ORGANIZATION',
  'SILENT_DEGRADER',
  'VOLATILE_OPERATOR',
  'HIGH_INTERVENTION_ORG',
]);

const HEALTHY_ARCHETYPES = new Set([
  'STABLE_OPERATOR',
  'RESILIENT_GROWER',
  'RECOVERY_ORIENTED',
]);

const DEGRADING_ARCHETYPES = new Set([
  'FRAGMENTING_ORGANIZATION',
  'SILENT_DEGRADER',
]);

// ── CollectiveOperationalNarrativeService ─────────────────────────────────────

export class CollectiveOperationalNarrativeService {
  /**
   * Generate a platform-level collective operational narrative.
   * Pure function — no DB queries.
   */
  static generate(
    validations:         ForecastValidation[],
    patterns:            CrossOrganizationalPattern[],
    archetypes:          OperationalArchetype[],
    interventionBenchmarks: InterventionBenchmark[],
    resilienceBenchmarks:   ResilienceBenchmark[],
    generatedFromWindow: { start: string; end: string },
  ): CollectiveOperationalNarrative {
    const generatedAt           = new Date().toISOString();
    const organizationsAnalyzed = archetypes.length;
    const validationsComplete   = validations.length;
    const patternsDetected      = patterns.length;

    // ── Archetype distribution ────────────────────────────────────────────────
    const archetypeDistribution: Record<string, number> = {};
    for (const a of archetypes) {
      archetypeDistribution[a.archetype] = (archetypeDistribution[a.archetype] ?? 0) + 1;
    }

    // Dominant archetype (most common)
    const dominantArchetype = Object.entries(archetypeDistribution)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'PLATEAUED_ORGANIZATION';

    // ── Overall platform state ────────────────────────────────────────────────
    const healthyCount   = archetypes.filter((a) => HEALTHY_ARCHETYPES.has(a.archetype)).length;
    const atRiskCount    = archetypes.filter((a) => AT_RISK_ARCHETYPES.has(a.archetype)).length;
    const degradingCount = archetypes.filter((a) => DEGRADING_ARCHETYPES.has(a.archetype)).length;

    const overallPlatformState: OverallPlatformState =
      (degradingCount > 0 && degradingCount >= Math.floor(organizationsAnalyzed / 2))
        ? 'DEGRADING' :
      (atRiskCount > healthyCount)
        ? 'AT_RISK' :
      (healthyCount >= atRiskCount * 2 || (atRiskCount === 0 && healthyCount > 0))
        ? 'STABLE' :
      'MIXED';

    // ── Forecast drift trend (Refinement 7) ───────────────────────────────────
    const accurateCount = validations.filter(
      (v) => v.validationResult === 'ACCURATE',
    ).length;
    const validationAccuracyRate = validationsComplete > 0
      ? accurateCount / validationsComplete
      : 0;

    const forecastDriftTrend: ForecastDriftTrend =
      validationAccuracyRate >= 0.6 ? 'IMPROVING' :
      validationAccuracyRate >= 0.4 ? 'STABLE'    :
      'DEGRADING';

    // ── Platform intelligence density ─────────────────────────────────────────
    const platformIntelligenceDensity: PlatformIntelligenceDensity =
      (patternsDetected >= 3 && validationsComplete >= 5) ? 'RICH'     :
      (patternsDetected >= 2 || validationsComplete >= 3) ? 'MODERATE' :
      'SPARSE';

    // ── Dominant cross-org pattern ────────────────────────────────────────────
    const dominantPatternType = patterns.length > 0
      ? patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0].patternType
      : undefined;

    // ── Top intervention type (highest effectiveness, then largest sample) ────
    const topIntervention = interventionBenchmarks
      .filter((b) => b.effectiveness === 'HIGH')
      .sort((a, b) => b.sampleSize - a.sampleSize)[0]
      ?? interventionBenchmarks.sort((a, b) => b.sampleSize - a.sampleSize)[0];
    const topInterventionType = topIntervention?.interventionType;

    // ── Platform narrative (3-sentence template — calm language) ──────────────
    const platformNarrative = buildPlatformNarrative(
      organizationsAnalyzed,
      overallPlatformState,
      dominantArchetype,
      forecastDriftTrend,
      validationAccuracyRate,
      dominantPatternType,
      patternsDetected,
      topInterventionType,
    );

    // ── Lineage (Refinement E) ────────────────────────────────────────────────
    const sourceOrganizationIds = [
      ...new Set(archetypes.map((a) => a.organizationId)),
    ].slice(0, 20);
    const relatedEventIds = [
      ...new Set(validations.flatMap((v) => v.relatedEventIds)),
    ].slice(0, 20);
    const traceReferences = [
      ...new Set(validations.flatMap((v) => v.traceReferences)),
    ].slice(0, 10);

    return {
      platformNarrative,
      overallPlatformState,
      forecastDriftTrend,
      platformIntelligenceDensity,
      organizationsAnalyzed,
      validationsComplete,
      patternsDetected,
      dominantArchetype,
      dominantPatternType,
      topInterventionType,
      archetypeDistribution,
      validationAccuracyRate: Math.round(validationAccuracyRate * 100) / 100,
      generatedFromWindow,
      forecastVersion:        'v1',
      generatedAt,
      traceReferences,
      relatedEventIds,
      sourceOrganizationIds,
    };
  }
}

// ── Template builder (calm language, no dramatization) ────────────────────────

function buildPlatformNarrative(
  orgCount:             number,
  platformState:        OverallPlatformState,
  dominantArchetype:    string,
  forecastDriftTrend:   ForecastDriftTrend,
  accuracyRate:         number,
  dominantPatternType:  string | undefined,
  patternsDetected:     number,
  topInterventionType:  string | undefined,
): string {
  const parts: string[] = [];

  // Sentence 1: Platform overview
  const stateLabel: Record<OverallPlatformState, string> = {
    STABLE:    'generally stable continuity across the platform',
    MIXED:     'a mixed continuity posture across the platform',
    AT_RISK:   'elevated operational risk signals across the platform',
    DEGRADING: 'a pattern of declining continuity across the platform',
  };
  const archetypeLabel = formatArchetype(dominantArchetype);
  parts.push(
    `Analysis of ${orgCount} organization${orgCount !== 1 ? 's' : ''} shows ${stateLabel[platformState]}, ` +
    `with ${archetypeLabel} as the most common operational profile.`,
  );

  // Sentence 2: Forecast accuracy / drift trend
  const accuracyPct = Math.round(accuracyRate * 100);
  const driftLabel: Record<ForecastDriftTrend, string> = {
    IMPROVING: `Forecast validation shows ${accuracyPct}% accuracy — predictive models are tracking observed continuity well.`,
    STABLE:    `Forecast accuracy is ${accuracyPct}% — models are performing within expected bounds.`,
    DEGRADING: `Forecast validation shows ${accuracyPct}% accuracy — predictive signals may benefit from recalibration.`,
  };
  parts.push(driftLabel[forecastDriftTrend]);

  // Sentence 3: Cross-org patterns or intervention
  if (patternsDetected > 0 && dominantPatternType) {
    const patternLabel = dominantPatternType.toLowerCase().replace(/_/g, ' ');
    parts.push(
      `${patternsDetected} cross-organizational pattern${patternsDetected !== 1 ? 's' : ''} detected, ` +
      `with ${patternLabel} as the most prevalent signal` +
      (topInterventionType
        ? `; ${formatInterventionType(topInterventionType)}-type interventions show the strongest observed effectiveness.`
        : '.'),
    );
  } else if (topInterventionType) {
    parts.push(
      `${formatInterventionType(topInterventionType)}-type interventions show the strongest observed effectiveness across the platform.`,
    );
  } else {
    parts.push(
      'Continued operational monitoring across all active organizations is the recommended posture.',
    );
  }

  return parts.join(' ');
}

function formatArchetype(archetype: string): string {
  const labels: Record<string, string> = {
    STABLE_OPERATOR:         'stable operator',
    RESILIENT_GROWER:        'resilient grower',
    RECOVERY_ORIENTED:       'recovery-oriented',
    FRAGMENTING_ORGANIZATION:'fragmenting organization',
    VOLATILE_OPERATOR:       'volatile operator',
    SILENT_DEGRADER:         'silent degrader',
    HIGH_INTERVENTION_ORG:   'high-intervention organization',
    PLATEAUED_ORGANIZATION:  'plateaued organization',
  };
  return labels[archetype] ?? archetype.toLowerCase().replace(/_/g, ' ');
}

function formatInterventionType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}
