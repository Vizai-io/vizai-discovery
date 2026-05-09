/**
 * @fileOverview InterventionLineageService — Sprint 7 Task 4.
 *
 * Tracks operational intervention chains over time. Correlates:
 *   ASSERTION events → recommendation completions → scan score deltas.
 *
 * Pure function — consumes OrganizationalTimeline + OperationalMemory +
 * OperationalMilestone[]. No DB queries.
 *
 * Refinements:
 *   1:  causalityStrength — WEAK | MODERATE | STRONG
 *   A:  traceReferences, relatedEventIds, sourceEntityIds
 *   B:  confidence scoring
 *   D:  replayVersion, generatedAt, windowDays
 *   9:  generatedFromWindow
 */

import type { OrganizationalTimeline, OperationalMilestone } from './organizational-timeline-service';
import type { OperationalMemory, InterventionChain }         from './operational-memory-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InterventionOutcome   = 'SUCCESSFUL' | 'PARTIAL' | 'FAILED' | 'UNKNOWN';
export type CausalityStrength     = 'WEAK' | 'MODERATE' | 'STRONG';  // Refinement 1
export type InterventionTrigger   = 'DRIFT' | 'CONTINUITY' | 'PLAYBOOK' | 'ASSERTION' | 'ONBOARDING';
export type ConfidenceLevel       = 'LOW' | 'MEDIUM' | 'HIGH';

export interface InterventionLineage {
  interventionId:    string;        // recommendation.id or operationalEvent.id
  triggeredBy:       InterventionTrigger;
  startedAt:         string;
  completedAt?:      string;
  outcome:           InterventionOutcome;
  causalityStrength: CausalityStrength;    // Refinement 1
  scoreBefore?:      number;
  scoreAfter?:       number;
  scoreDelta?:       number;
  frictionBefore:    number;               // assertion events 7d before
  frictionAfter:     number;               // assertion events 7d after
  downstreamEffects: string[];
  linkedMilestones:  string[];             // milestone types correlated with this intervention
  confidence:        ConfidenceLevel;
  // Refinement A
  traceReferences:   string[];
  relatedEventIds:   string[];
  sourceEntityIds:   string[];
}

export interface InterventionLineageReport {
  organizationId:     string;
  lineages:           InterventionLineage[];
  successfulCount:    number;
  partialCount:       number;
  failedCount:        number;
  unknownCount:       number;
  averageCausalityStrength: string;
  replayVersion:      'v1';
  generatedAt:        string;
  windowDays:         number;
  traceReferences:    string[];
  relatedEventIds:    string[];
  sourceEntityIds:    string[];
  generatedFromWindow: { start: string; end: string };
}

// ── InterventionLineageService ────────────────────────────────────────────────

export class InterventionLineageService {
  /**
   * Compute intervention lineage from pre-built timeline, memory, and milestones.
   * Pure function — no DB queries.
   */
  static computeForOrg(
    timeline:   OrganizationalTimeline,
    memory:     OperationalMemory,
    milestones: OperationalMilestone[],
  ): InterventionLineageReport {
    const generatedAt   = new Date().toISOString();
    const { organizationId, events, continuityTransitions, windowDays } = timeline;
    const lineages: InterventionLineage[] = [];

    // ── Build from memory's intervention chains ───────────────────────────────
    for (const chain of memory.interventionChains) {
      const lineage = buildLineage(chain, events, milestones);
      lineages.push(lineage);
    }

    // ── Also capture CONTINUITY / PLAYBOOK events as standalone interventions ─
    const continuityEvents = events.filter(
      (e) => (e.category === 'CONTINUITY' || e.category === 'PLAYBOOK') &&
              (e.severity === 'CRITICAL' || e.severity === 'ERROR'),
    );
    for (const ev of continuityEvents) {
      // Only add if not already covered by a chain
      const covered = lineages.some(
        (l) => l.relatedEventIds.includes(ev.eventId),
      );
      if (covered) continue;

      // Look for improvements after this event
      const sevenDayMs = 7 * 24 * 60 * 60 * 1000;
      const evTs = new Date(ev.timestamp);
      const assertionsBefore = events.filter(
        (e) => e.category === 'ASSERTION' &&
               new Date(e.timestamp).getTime() >= evTs.getTime() - sevenDayMs &&
               e.timestamp < ev.timestamp,
      ).length;
      const assertionsAfter = events.filter(
        (e) => e.category === 'ASSERTION' &&
               e.timestamp >= ev.timestamp &&
               new Date(e.timestamp).getTime() <= evTs.getTime() + sevenDayMs,
      ).length;

      const outcome: InterventionOutcome = assertionsAfter < assertionsBefore ? 'PARTIAL' : 'UNKNOWN';

      lineages.push({
        interventionId:    ev.eventId,
        triggeredBy:       ev.category === 'PLAYBOOK' ? 'PLAYBOOK' : 'CONTINUITY',
        startedAt:         ev.timestamp,
        completedAt:       undefined,
        outcome,
        causalityStrength: 'WEAK',
        frictionBefore:    assertionsBefore,
        frictionAfter:     assertionsAfter,
        downstreamEffects: outcome === 'PARTIAL' ? ['Friction count reduced after event'] : [],
        linkedMilestones:  linkedMilestoneTypes(ev.timestamp, milestones),
        confidence:        'LOW',
        traceReferences:   ev.traceReferences,
        relatedEventIds:   [ev.eventId],
        sourceEntityIds:   [ev.sourceId],
      });
    }

    // ── Summary counts ────────────────────────────────────────────────────────
    const successfulCount = lineages.filter((l) => l.outcome === 'SUCCESSFUL').length;
    const partialCount    = lineages.filter((l) => l.outcome === 'PARTIAL').length;
    const failedCount     = lineages.filter((l) => l.outcome === 'FAILED').length;
    const unknownCount    = lineages.filter((l) => l.outcome === 'UNKNOWN').length;

    const strengthRank = { STRONG: 2, MODERATE: 1, WEAK: 0 };
    const avgStrengthRank = lineages.length > 0
      ? lineages.reduce((sum, l) => sum + strengthRank[l.causalityStrength], 0) / lineages.length
      : 0;
    const averageCausalityStrength =
      avgStrengthRank >= 1.5 ? 'STRONG' :
      avgStrengthRank >= 0.5 ? 'MODERATE' : 'WEAK';

    const traceReferences = [...new Set(lineages.flatMap((l) => l.traceReferences))].slice(0, 20);
    const relatedEventIds = [...new Set(lineages.flatMap((l) => l.relatedEventIds))].slice(0, 30);
    const sourceEntityIds = [...new Set(lineages.flatMap((l) => l.sourceEntityIds))].slice(0, 30);

    return {
      organizationId,
      lineages:                lineages.slice(0, 30),
      successfulCount,
      partialCount,
      failedCount,
      unknownCount,
      averageCausalityStrength,
      replayVersion:           'v1',
      generatedAt,
      windowDays,
      traceReferences,
      relatedEventIds,
      sourceEntityIds,
      generatedFromWindow: timeline.generatedFromWindow,
    };
  }

  static computeForOrgs(
    orgIds:    string[],
    timelines: Map<string, OrganizationalTimeline>,
    memories:  Map<string, OperationalMemory>,
    milestoneMap: Map<string, OperationalMilestone[]>,
  ): InterventionLineageReport[] {
    const results: InterventionLineageReport[] = [];
    for (const orgId of orgIds) {
      const tl  = timelines.get(orgId);
      const mem = memories.get(orgId);
      if (!tl || !mem) continue;
      const ms = milestoneMap.get(orgId) ?? [];
      results.push(InterventionLineageService.computeForOrg(tl, mem, ms));
    }
    return results;
  }
}

// ── Build lineage from memory's InterventionChain ─────────────────────────────

function buildLineage(
  chain:      InterventionChain,
  events:     ReturnType<typeof Array.prototype.slice>,
  milestones: OperationalMilestone[],
): InterventionLineage {
  const sevenDayMs = 7 * 24 * 60 * 60 * 1000;
  const recTs      = new Date(chain.recCompletedAt);

  // Friction counts (assertion events) 7d before/after rec completion
  const frictionBefore = events.filter(
    (e: any) => e.category === 'ASSERTION' &&
      new Date(e.timestamp).getTime() >= recTs.getTime() - sevenDayMs &&
      e.timestamp < chain.recCompletedAt,
  ).length;
  const frictionAfter = events.filter(
    (e: any) => e.category === 'ASSERTION' &&
      e.timestamp >= chain.recCompletedAt &&
      new Date(e.timestamp).getTime() <= recTs.getTime() + sevenDayMs,
  ).length;

  // Derive trigger type
  const triggeredBy: InterventionTrigger =
    chain.triggerType.includes('CONTINUITY') ? 'CONTINUITY' :
    chain.triggerType.includes('SILENCE')     ? 'CONTINUITY' :
    chain.triggerType.includes('ONBOARDING')  ? 'ONBOARDING' :
    'ASSERTION';

  // Classify outcome from score delta and friction
  let outcome: InterventionOutcome;
  if (chain.scoreDelta !== undefined) {
    if      (chain.scoreDelta > 3 && frictionAfter <= frictionBefore) outcome = 'SUCCESSFUL';
    else if (chain.scoreDelta > 0 || frictionAfter < frictionBefore)  outcome = 'PARTIAL';
    else if (chain.scoreDelta < -3)                                    outcome = 'FAILED';
    else                                                               outcome = 'NEUTRAL' as any; // will use PARTIAL
  } else {
    outcome = 'UNKNOWN';
  }
  if ((outcome as string) === 'NEUTRAL') outcome = 'PARTIAL';

  // CausalityStrength (Refinement 1)
  const recToScanDays = chain.scanCompletedAt
    ? Math.abs(new Date(chain.scanCompletedAt).getTime() - recTs.getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  const hasCompetingInterventions = false; // simplified — no overlap detection in this context
  const causalityStrength: CausalityStrength =
    (recToScanDays <= 14 && chain.scoreDelta !== undefined && (chain.scoreDelta ?? 0) > 5) ? 'STRONG' :
    (recToScanDays <= 30 && chain.scoreDelta !== undefined && (chain.scoreDelta ?? 0) > 2) ? 'MODERATE' :
    'WEAK';

  // Downstream effects
  const downstreamEffects: string[] = [];
  if (chain.scoreDelta !== undefined) {
    downstreamEffects.push(`Scan score ${chain.scoreDelta > 0 ? 'improved' : 'changed'} by ${Math.abs(chain.scoreDelta).toFixed(1)} points.`);
  }
  if (frictionAfter < frictionBefore) {
    downstreamEffects.push(`Assertion events reduced from ${frictionBefore} to ${frictionAfter} in the 7-day period.`);
  }

  return {
    interventionId:    chain.recommendationId,
    triggeredBy,
    startedAt:         chain.triggerAt,
    completedAt:       chain.recCompletedAt,
    outcome,
    causalityStrength,
    scoreBefore:       chain.scoreBefore,
    scoreAfter:        chain.scoreAfter,
    scoreDelta:        chain.scoreDelta,
    frictionBefore,
    frictionAfter,
    downstreamEffects,
    linkedMilestones:  linkedMilestoneTypes(chain.recCompletedAt, milestones),
    confidence:        causalityStrength === 'STRONG' ? 'HIGH' : causalityStrength === 'MODERATE' ? 'MEDIUM' : 'LOW',
    traceReferences:   [],
    relatedEventIds:   [chain.triggerEventId, chain.recommendationId, ...(chain.scanId ? [chain.scanId] : [])],
    sourceEntityIds:   [chain.recommendationId, ...(chain.scanId ? [chain.scanId] : [])],
  };
}

// ── Which milestone types occurred within 30d after an intervention? ──────────

function linkedMilestoneTypes(completedAt: string, milestones: OperationalMilestone[]): string[] {
  const thirtyDayMs = 30 * 24 * 60 * 60 * 1000;
  const ts = new Date(completedAt).getTime();
  return milestones
    .filter((m) => {
      const mTs = new Date(m.achievedAt).getTime();
      return mTs >= ts && mTs <= ts + thirtyDayMs;
    })
    .map((m) => m.milestoneType);
}
