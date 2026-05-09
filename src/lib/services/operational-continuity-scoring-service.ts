/**
 * @fileOverview OperationalContinuityScoringService — Sprint 6 Task 5.
 *
 * Derives the overall operational maturity signal for an organization by
 * compositing outputs from Tasks 1, 3, and 4. Pure in-memory computation —
 * no additional DB queries.
 *
 * Philosophy: calm operational truth. Not a vanity score. Not gamified.
 * This is operational state classification for internal operators.
 *
 * Composite score formula (0–100):
 *   continuityScore * 0.35
 *   + (100 - driftScore) * 0.30
 *   + activationScore * 0.20
 *   + frictionScore * 0.15
 *
 * Refinements:
 *   3:  volatilityState (from WorkflowContinuity)
 *   5:  confidence (derived from input confidences)
 *   2:  calculatedAt, windowDays, calculationVersion
 *   9:  lineage forwarded from inputs
 *   E:  pure function — deterministic, stateless, replay-safe
 */

import type { WorkflowContinuity } from './workflow-continuity-service';
import type { OrganizationalDrift } from './organizational-drift-service';
import type { OnboardingQuality }   from './onboarding-intelligence-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContinuityMaturityState =
  | 'OPTIMIZING'
  | 'STABLE'
  | 'WATCHING'
  | 'FRAGMENTED'
  | 'CRITICAL';

export type VolatilityState  = 'STABLE' | 'FLUCTUATING' | 'UNSTABLE';
export type ConfidenceLevel  = 'LOW' | 'MEDIUM' | 'HIGH';

export interface OperationalContinuityScore {
  organizationId:    string;
  compositeScore:    number;         // 0–100
  maturityState:     ContinuityMaturityState;
  volatilityState:   VolatilityState; // forwarded from WorkflowContinuity (Refinement 3)
  confidence:        ConfidenceLevel; // Refinement 5

  // Component breakdown (for explainability — Refinement 7 philosophy)
  components: {
    continuityScore:  number;
    inverseDriftScore: number;
    activationScore:  number;
    frictionScore:    number;
  };

  // Lineage forwarded from inputs (Refinement 9)
  traceReferences:          string[];
  relatedEventIds:          string[];
  sourceScanIds:            string[];
  sourceRecommendationIds:  string[];

  // Refinement 2
  calculatedAt:       string;
  windowDays:         7 | 30 | 90;
  calculationVersion: 'v1';
}

// ── Confidence merge helper ───────────────────────────────────────────────────

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  LOW: 0, MEDIUM: 1, HIGH: 2,
};

function mergeConfidence(...levels: ConfidenceLevel[]): ConfidenceLevel {
  const min = Math.min(...levels.map((l) => CONFIDENCE_RANK[l]));
  return (['LOW', 'MEDIUM', 'HIGH'] as const)[min];
}

// ── OperationalContinuityScoringService ──────────────────────────────────────

export class OperationalContinuityScoringService {
  /**
   * Compute the composite operational continuity score for a single organization.
   * Pure function — all inputs already computed by Tasks 1, 3, 4.
   *
   * frictionSignalCount: count of DriftSignals in the org's drift report
   * (used as the friction proxy without an extra DB query).
   */
  static computeForOrg(
    continuity:          WorkflowContinuity,
    drift:               OrganizationalDrift,
    onboarding:          OnboardingQuality,
    frictionSignalCount: number,
  ): OperationalContinuityScore {
    const now = new Date();

    // ── Friction score (inverse of signal count) ──────────────────────────────
    // Each friction signal is a strike. 8 signals = max friction = score 0.
    const frictionScore = Math.max(0, 100 - frictionSignalCount * 12.5);

    // ── Composite score ───────────────────────────────────────────────────────
    const inverseDrift = 100 - drift.driftScore;
    const rawScore =
      continuity.continuityScore * 0.35
      + inverseDrift             * 0.30
      + onboarding.activationScore * 0.20
      + frictionScore              * 0.15;

    const compositeScore = Math.round(Math.max(0, Math.min(100, rawScore)));

    // ── Maturity state (priority-ordered) ─────────────────────────────────────
    let maturityState: ContinuityMaturityState;
    if (compositeScore < 25 || drift.driftState === 'CRITICAL') {
      maturityState = 'CRITICAL';
    } else if (compositeScore < 45) {
      maturityState = 'FRAGMENTED';
    } else if (compositeScore < 65) {
      maturityState = 'WATCHING';
    } else if (compositeScore < 80) {
      maturityState = 'STABLE';
    } else if (
      continuity.continuityState === 'HEALTHY' &&
      drift.driftState           === 'STABLE'  &&
      compositeScore             >= 80
    ) {
      maturityState = 'OPTIMIZING';
    } else {
      maturityState = 'STABLE';
    }

    // ── Confidence (Refinement 5 — merge input confidences) ──────────────────
    const confidence = mergeConfidence(
      continuity.confidence,
      drift.confidence,
      onboarding.confidence,
    );

    // ── Lineage (Refinement 9 — union of all input lineage) ──────────────────
    const traceReferences = [
      ...new Set([...continuity.traceReferences, ...drift.traceReferences, ...onboarding.traceReferences]),
    ].slice(0, 30);
    const relatedEventIds = [
      ...new Set([...continuity.relatedEventIds, ...drift.relatedEventIds, ...onboarding.relatedEventIds]),
    ].slice(0, 30);
    const sourceScanIds = [
      ...new Set([...continuity.sourceScanIds, ...drift.sourceScanIds, ...onboarding.sourceScanIds]),
    ].slice(0, 20);
    const sourceRecommendationIds = [
      ...new Set([
        ...continuity.sourceRecommendationIds,
        ...drift.sourceRecommendationIds,
        ...onboarding.sourceRecommendationIds,
      ]),
    ].slice(0, 20);

    return {
      organizationId:    continuity.organizationId,
      compositeScore,
      maturityState,
      volatilityState:   continuity.volatilityState, // Refinement 3 — forwarded
      confidence,
      components: {
        continuityScore:   Math.round(continuity.continuityScore),
        inverseDriftScore: Math.round(inverseDrift),
        activationScore:   Math.round(onboarding.activationScore),
        frictionScore:     Math.round(frictionScore),
      },
      traceReferences,
      relatedEventIds,
      sourceScanIds,
      sourceRecommendationIds,
      calculatedAt:       now.toISOString(),
      windowDays:         continuity.windowDays,
      calculationVersion: 'v1',
    };
  }

  /**
   * Batch computation for multiple orgs.
   * Inputs are provided as pre-computed Maps keyed by orgId.
   */
  static computeForOrgs(
    orgIds:        string[],
    continuities:  Map<string, WorkflowContinuity>,
    drifts:        Map<string, OrganizationalDrift>,
    onboardings:   Map<string, OnboardingQuality>,
  ): OperationalContinuityScore[] {
    const results: OperationalContinuityScore[] = [];

    for (const orgId of orgIds) {
      const cont = continuities.get(orgId);
      const drft = drifts.get(orgId);
      const onbd = onboardings.get(orgId);
      if (!cont || !drft || !onbd) continue;

      const frictionSignalCount = drft.contributingSignals.length;
      results.push(
        OperationalContinuityScoringService.computeForOrg(cont, drft, onbd, frictionSignalCount),
      );
    }

    return results;
  }
}
