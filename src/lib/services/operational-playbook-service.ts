/**
 * @fileOverview OperationalPlaybookService — Sprint 6 Task 6.
 *
 * Converts operational intelligence into deterministic, explainable guidance.
 * Pure function — no DB queries, no side effects. Consumes pre-computed outputs
 * from Tasks 1–5 and applies a rule engine to produce PlaybookActions.
 *
 * Philosophy (Refinement 7): every action must be justified. No opaque advice.
 * Every PlaybookAction carries an `explanation` (why it was generated) and
 * `triggeredBySignals` (the named signals that caused it).
 *
 * Refinements:
 *   7:  explanation + triggeredBySignals on every PlaybookAction
 *   2:  calculatedAt, windowDays, calculationVersion
 *   5:  confidence forwarded from OperationalContinuityScore
 *   9:  lineage unioned from all input lineages
 *   E:  pure function — deterministic, stateless, replay-safe
 */

import type { WorkflowContinuity }        from './workflow-continuity-service';
import type { OrganizationalDrift }        from './organizational-drift-service';
import type { OnboardingQuality }          from './onboarding-intelligence-service';
import type { OperationalContinuityScore } from './operational-continuity-scoring-service';
import type { RecommendationImpact }       from './recommendation-impact-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlaybookUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PlaybookSource  = 'FRICTION' | 'DRIFT' | 'RANKING' | 'ONBOARDING' | 'CONTINUITY';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PlaybookAction {
  actionId:           string;         // deterministic slug — stable across runs
  title:              string;
  description:        string;
  explanation:        string;         // Refinement 7 — why this action was generated
  triggeredBySignals: string[];       // Refinement 7 — named signals that triggered it
  source:             PlaybookSource;
  priority:           number;         // 1 = highest priority
}

export interface OperationalPlaybook {
  organizationId:     string;
  urgency:            PlaybookUrgency;
  recommendedActions: PlaybookAction[];
  generatedFrom:      PlaybookSource;
  rationale:          string;
  confidence:         ConfidenceLevel;

  // Refinement 9 — lineage unioned from all inputs
  traceReferences:          string[];
  relatedEventIds:          string[];
  sourceScanIds:            string[];
  sourceRecommendationIds:  string[];

  // Refinement 2
  calculatedAt:       string;
  windowDays:         7 | 30 | 90;
  calculationVersion: 'v1';
}

// ── OperationalPlaybookService ────────────────────────────────────────────────

export class OperationalPlaybookService {
  /**
   * Generate an operational playbook for a single organization.
   * Pure function — deterministic, stateless, replay-safe (Refinement E).
   */
  static computeForOrg(
    continuity:  WorkflowContinuity,
    drift:       OrganizationalDrift,
    onboarding:  OnboardingQuality,
    score:       OperationalContinuityScore,
    impacts:     RecommendationImpact[],
    windowDays:  7 | 30 | 90 = 30,
  ): OperationalPlaybook {
    const candidates: PlaybookAction[] = [];

    // ── Urgency classification ────────────────────────────────────────────────
    let urgency: PlaybookUrgency;
    if (score.maturityState === 'CRITICAL' || drift.driftState === 'CRITICAL') {
      urgency = 'CRITICAL';
    } else if (score.maturityState === 'FRAGMENTED' || drift.driftState === 'DEGRADING') {
      urgency = 'HIGH';
    } else if (score.maturityState === 'WATCHING' || drift.driftState === 'DRIFTING') {
      urgency = 'MEDIUM';
    } else {
      urgency = 'LOW';
    }

    const driftSignalNames = drift.contributingSignals.map((s) => s.signal);

    // ── Drift-driven action rules (one per contributing signal) ───────────────

    for (const sig of drift.contributingSignals) {
      switch (sig.signal) {

        case 'SCAN_CADENCE_DECLINE':
          candidates.push({
            actionId:           'restore-scan-cadence',
            title:              'Restore scan cadence',
            description:        'Run a perception scan now to re-establish regular coverage intervals.',
            explanation:        `${sig.description} Irregular scanning leaves the platform operating on stale visibility data, reducing the reliability of all downstream recommendations.`,
            triggeredBySignals: ['SCAN_CADENCE_DECLINE'],
            source:             'CONTINUITY',
            priority:           urgency === 'CRITICAL' ? 1 : 2,
          });
          break;

        case 'RECOMMENDATION_ABANDONMENT':
          candidates.push({
            actionId:           'action-stalled-recommendations',
            title:              'Action stalled recommendations',
            description:        'Review outstanding recommendations in the dashboard and begin work on the highest-priority items.',
            explanation:        `${sig.description} Unactioned recommendations indicate disengagement from the improvement cycle. Over time, abandoned recommendations accumulate as technical debt in brand visibility.`,
            triggeredBySignals: ['RECOMMENDATION_ABANDONMENT'],
            source:             'CONTINUITY',
            priority:           3,
          });
          break;

        case 'INCREASING_FRICTION':
          candidates.push({
            actionId:           'investigate-friction-signals',
            title:              'Investigate pipeline friction',
            description:        'Review /admin/operations for assertion events and resolve any active pipeline failures.',
            explanation:        `${sig.description} A rising friction count signals that the operational infrastructure is under stress. Unaddressed, this leads to scan failures and data gaps.`,
            triggeredBySignals: ['INCREASING_FRICTION'],
            source:             'FRICTION',
            priority:           urgency === 'CRITICAL' ? 1 : 2,
          });
          break;

        case 'STALE_SCHEDULES':
          candidates.push({
            actionId:           'update-stale-schedules',
            title:              'Update overdue scan schedules',
            description:        'Review scan schedules and re-trigger or adjust intervals for any that are overdue.',
            explanation:        `${sig.description} Overdue schedules indicate that automatic scans are not running. This silently degrades scan cadence without visible errors.`,
            triggeredBySignals: ['STALE_SCHEDULES'],
            source:             'CONTINUITY',
            priority:           4,
          });
          break;

        case 'UNRESOLVED_ASSERTIONS':
          candidates.push({
            actionId:           'clear-assertion-events',
            title:              'Resolve unresolved assertion events',
            description:        'Check /admin/operations for open assertion events and investigate each one to determine root cause.',
            explanation:        `${sig.description} Persistent assertion events represent known failures that are not self-healing. Each one is a potential data quality gap.`,
            triggeredBySignals: ['UNRESOLVED_ASSERTIONS'],
            source:             'FRICTION',
            priority:           urgency === 'CRITICAL' ? 1 : 2,
          });
          break;

        case 'DECLINING_VISIBILITY':
          candidates.push({
            actionId:           'address-declining-scores',
            title:              'Address declining visibility scores',
            description:        'Review and action high-priority recommendations to reverse the downward score trend.',
            explanation:        `${sig.description} A consistent score decline across successive scans indicates that visibility is eroding faster than it is being recovered. Intervention is needed before the trend becomes a structural deficit.`,
            triggeredBySignals: ['DECLINING_VISIBILITY'],
            source:             'RANKING',
            priority:           3,
          });
          break;

        case 'NOTIFICATION_DISENGAGEMENT':
          candidates.push({
            actionId:           'review-notification-settings',
            title:              'Review notification configuration',
            description:        'Check notification delivery routing to ensure the team is receiving and reading operational alerts.',
            explanation:        `${sig.description} When notifications go unread, the team is not receiving operational signal from the platform. This creates a visibility gap between the system's knowledge and the team's awareness.`,
            triggeredBySignals: ['NOTIFICATION_DISENGAGEMENT'],
            source:             'CONTINUITY',
            priority:           5,
          });
          break;

        case 'ONBOARDING_INCOMPLETENESS':
          candidates.push({
            actionId:           'complete-onboarding',
            title:              'Complete organizational onboarding',
            description:        'Run a first perception scan and configure an active scan schedule to fully activate the platform.',
            explanation:        `${sig.description} Without completing onboarding, the platform cannot generate meaningful intelligence. All downstream workflows depend on at least one completed scan and an active schedule.`,
            triggeredBySignals: ['ONBOARDING_INCOMPLETENESS'],
            source:             'ONBOARDING',
            priority:           1,
          });
          break;
      }
    }

    // ── Onboarding-driven actions (from OnboardingQuality) ───────────────────

    if (
      onboarding.onboardingState === 'STALLED' &&
      !candidates.some((a) => a.actionId === 'complete-onboarding')
    ) {
      candidates.push({
        actionId:           'complete-onboarding',
        title:              'Complete organizational onboarding',
        description:        'Complete all onboarding steps: run a perception scan, configure a schedule, and action at least 2 recommendations.',
        explanation:        `Onboarding is stalled with an activation score of ${onboarding.activationScore}/100. The minimum activation threshold requires a completed scan, an active schedule, and at least 2 actioned recommendations.`,
        triggeredBySignals: ['ONBOARDING_INCOMPLETENESS'],
        source:             'ONBOARDING',
        priority:           1,
      });
    }

    if (
      onboarding.replayProvisioningCount > 0 &&
      !candidates.some((a) => a.actionId === 'review-provisioning-replays')
    ) {
      candidates.push({
        actionId:           'review-provisioning-replays',
        title:              'Investigate provisioning replay events',
        description:        `Review the ${onboarding.replayProvisioningCount} provisioning replay event(s) to understand why re-provisioning was necessary.`,
        explanation:        `Provisioning replays indicate the initial provisioning did not complete cleanly, requiring manual retry. Repeated replays may signal a systemic provisioning failure.`,
        triggeredBySignals: ['ONBOARDING_INCOMPLETENESS'],
        source:             'ONBOARDING',
        priority:           2,
      });
    }

    // ── Recommendation impact-driven actions ──────────────────────────────────

    const negativeImpacts = impacts.filter((i) => i.impactState === 'NEGATIVE');
    if (negativeImpacts.length > 0) {
      const categories = [...new Set(negativeImpacts.map((i) => i.category))].join(', ');
      candidates.push({
        actionId:           'revisit-regressive-recommendations',
        title:              'Revisit regressive recommendations',
        description:        `Review ${negativeImpacts.length} recommendation(s) that correlated with a visibility score decline after completion.`,
        explanation:        `${negativeImpacts.length} completed recommendation(s) across [${categories}] are associated with a negative visibility delta in the scan that followed. These actions may have had unintended side-effects and should be audited.`,
        triggeredBySignals: ['DECLINING_VISIBILITY'],
        source:             'RANKING',
        priority:           3,
      });
    }

    // ── Catch-all: below-target score with no specific signals ────────────────

    if (
      candidates.length === 0 &&
      score.maturityState !== 'OPTIMIZING' &&
      score.maturityState !== 'STABLE'
    ) {
      candidates.push({
        actionId:           'general-operational-review',
        title:              'Conduct operational review',
        description:        'Review the continuity dashboard for this organization and identify areas for improvement.',
        explanation:        `Composite operational score is ${score.compositeScore}/100 (${score.maturityState}). No specific high-signal issues were detected, but overall health is below target. A manual review may surface the root cause.`,
        triggeredBySignals: [],
        source:             'CONTINUITY',
        priority:           5,
      });
    }

    // ── Deduplicate by actionId ────────────────────────────────────────────────
    const seen = new Set<string>();
    const deduped = candidates.filter((a) => {
      if (seen.has(a.actionId)) return false;
      seen.add(a.actionId);
      return true;
    });

    // ── Sort by priority asc, then cap at 5 ───────────────────────────────────
    const finalActions = deduped
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5);

    // ── Primary source (dominant signal class) ────────────────────────────────
    const generatedFrom = deriveGeneratedFrom(
      drift.driftState,
      score.maturityState,
      onboarding.onboardingState,
      negativeImpacts.length,
      driftSignalNames,
    );

    // ── Rationale ─────────────────────────────────────────────────────────────
    const rationale = buildRationale(score, drift, onboarding, urgency);

    // ── Lineage (Refinement 9) ─────────────────────────────────────────────────
    const traceReferences = [
      ...new Set([
        ...continuity.traceReferences,
        ...drift.traceReferences,
        ...onboarding.traceReferences,
        ...score.traceReferences,
      ]),
    ].slice(0, 30);

    const relatedEventIds = [
      ...new Set([
        ...continuity.relatedEventIds,
        ...drift.relatedEventIds,
        ...onboarding.relatedEventIds,
        ...score.relatedEventIds,
      ]),
    ].slice(0, 30);

    const sourceScanIds = [
      ...new Set([
        ...continuity.sourceScanIds,
        ...drift.sourceScanIds,
        ...onboarding.sourceScanIds,
        ...score.sourceScanIds,
      ]),
    ].slice(0, 20);

    const sourceRecommendationIds = [
      ...new Set([
        ...continuity.sourceRecommendationIds,
        ...drift.sourceRecommendationIds,
        ...onboarding.sourceRecommendationIds,
        ...score.sourceRecommendationIds,
      ]),
    ].slice(0, 20);

    return {
      organizationId:     continuity.organizationId,
      urgency,
      recommendedActions: finalActions,
      generatedFrom,
      rationale,
      confidence:         score.confidence,  // Refinement 5 — forwarded from composite
      traceReferences,
      relatedEventIds,
      sourceScanIds,
      sourceRecommendationIds,
      calculatedAt:       new Date().toISOString(),
      windowDays,
      calculationVersion: 'v1',
    };
  }

  /**
   * Batch computation for multiple organizations.
   * Inputs are pre-computed Maps keyed by orgId.
   */
  static computeForOrgs(
    orgIds:       string[],
    continuities: Map<string, WorkflowContinuity>,
    drifts:       Map<string, OrganizationalDrift>,
    onboardings:  Map<string, OnboardingQuality>,
    scores:       Map<string, OperationalContinuityScore>,
    impactsByOrg: Map<string, RecommendationImpact[]>,
    windowDays:   7 | 30 | 90 = 30,
  ): OperationalPlaybook[] {
    const results: OperationalPlaybook[] = [];

    for (const orgId of orgIds) {
      const cont = continuities.get(orgId);
      const drft = drifts.get(orgId);
      const onbd = onboardings.get(orgId);
      const scr  = scores.get(orgId);
      if (!cont || !drft || !onbd || !scr) continue;

      const impacts = impactsByOrg.get(orgId) ?? [];
      results.push(
        OperationalPlaybookService.computeForOrg(cont, drft, onbd, scr, impacts, windowDays),
      );
    }

    return results;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveGeneratedFrom(
  driftState:      string,
  maturityState:   string,
  onboardingState: string,
  negativeCount:   number,
  driftSignals:    string[],
): PlaybookSource {
  if (driftState === 'CRITICAL' || driftState === 'DEGRADING')           return 'DRIFT';
  if (maturityState === 'CRITICAL' || maturityState === 'FRAGMENTED')    return 'CONTINUITY';
  if (onboardingState === 'STALLED')                                     return 'ONBOARDING';
  if (negativeCount > 0)                                                 return 'RANKING';
  if (
    driftSignals.includes('INCREASING_FRICTION') ||
    driftSignals.includes('UNRESOLVED_ASSERTIONS')
  )                                                                      return 'FRICTION';
  return 'CONTINUITY';
}

function buildRationale(
  score:      OperationalContinuityScore,
  drift:      OrganizationalDrift,
  onboarding: OnboardingQuality,
  urgency:    PlaybookUrgency,
): string {
  const parts: string[] = [];

  parts.push(
    `Composite operational score is ${score.compositeScore}/100 (${score.maturityState}).`,
  );

  if (drift.driftState !== 'STABLE') {
    parts.push(
      `Organizational drift is ${drift.driftState} with ${drift.contributingSignals.length} contributing signal(s).`,
    );
  }

  if (onboarding.onboardingState !== 'SMOOTH') {
    parts.push(
      `Onboarding state is ${onboarding.onboardingState} (activation score: ${onboarding.activationScore}/100).`,
    );
  }

  if (urgency === 'CRITICAL' || urgency === 'HIGH') {
    parts.push('Immediate action is required to prevent further operational degradation.');
  }

  return parts.join(' ');
}
