/**
 * @fileOverview OrganizationalNarrativeService — Sprint 7 Task 6.
 *
 * Generates deterministic, template-based operational summaries from
 * the outputs of Tasks 1–5. No LLM. No generative AI. No opaque synthesis.
 *
 * All output text is constructed from observable operational facts using
 * structured templates. Language is calm and factual (Refinement C, 6):
 *
 *   PREFERRED: "Continuity declined during the period due to reduced scan cadence."
 *   AVOIDED:   "The organization experienced catastrophic degradation."
 *
 * Narrative text uses only:
 *   - Event counts
 *   - State labels
 *   - Score values
 *   - Duration facts
 *   - Intervention outcomes
 *
 * Refinements:
 *   6:  Language calmness — prohibited dramatic phrasing
 *   7:  memoryDensity forwarded onto narrative output
 *   A:  traceReferences, relatedEventIds, sourceEntityIds
 *   B:  confidence scoring
 *   D:  replayVersion, generatedAt, windowDays
 *   9:  generatedFromWindow
 */

import type { OrganizationalTimeline }       from './organizational-timeline-service';
import type { OperationalMemory }            from './operational-memory-service';
import type { ContinuityReplay }             from './continuity-replay-service';
import type { InterventionLineageReport }    from './intervention-lineage-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContinuityTrend = 'IMPROVING' | 'STABLE' | 'DECLINING';
export type NarrativeSource = 'TIMELINE' | 'CONTINUITY' | 'DRIFT' | 'PLAYBOOK' | 'MILESTONES';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type MemoryDensity   = 'SPARSE' | 'MODERATE' | 'RICH';

export interface OrganizationalNarrative {
  organizationId:           string;
  operationalStateSummary:  string;
  dominantRiskFactors:      string[];
  strongestRecoverySignals: string[];
  continuityTrend:          ContinuityTrend;
  generatedFrom:            NarrativeSource;
  memoryDensity:            MemoryDensity;   // Refinement 7
  confidence:               ConfidenceLevel; // Refinement B
  replayVersion:            'v1';            // Refinement D
  generatedAt:              string;
  windowDays:               number;
  traceReferences:          string[];        // Refinement A
  relatedEventIds:          string[];        // Refinement A
  sourceEntityIds:          string[];        // Refinement A
  generatedFromWindow:      { start: string; end: string }; // Refinement 9
}

// ── OrganizationalNarrativeService ───────────────────────────────────────────

export class OrganizationalNarrativeService {
  /**
   * Generate a deterministic operational narrative for a single organization.
   * Pure function — no DB queries.
   */
  static generateForOrg(
    timeline:   OrganizationalTimeline,
    memory:     OperationalMemory,
    replay:     ContinuityReplay,
    lineage:    InterventionLineageReport,
    orgName:    string,
  ): OrganizationalNarrative {
    const generatedAt = new Date().toISOString();
    const { organizationId, windowDays, events, continuityTransitions } = timeline;

    // ── Continuity trend (from replay proxy scores) ──────────────────────────
    const continuityTrend = deriveContinuityTrend(replay);

    // ── Operational state summary (template — Refinement 6) ──────────────────
    const scanCount     = events.filter((e) => e.category === 'SCAN').length;
    const recCount      = events.filter((e) => e.category === 'RECOMMENDATION').length;
    const assertionCount= events.filter((e) => e.category === 'ASSERTION').length;
    const latestSnapshot= replay.snapshots.length > 0
      ? replay.snapshots[replay.snapshots.length - 1]
      : null;
    const currentState  = latestSnapshot?.state ?? 'UNKNOWN';
    const currentScore  = latestSnapshot?.proxyScore ?? null;

    const operationalStateSummary = buildSummary(
      orgName, windowDays, scanCount, recCount, assertionCount,
      currentState, currentScore, continuityTrend,
      memory.degradationPeriods.length, memory.recoveryPeriods.length,
    );

    // ── Dominant risk factors ─────────────────────────────────────────────────
    const dominantRiskFactors = buildRiskFactors(
      events, memory, lineage, continuityTransitions,
    );

    // ── Strongest recovery signals ────────────────────────────────────────────
    const strongestRecoverySignals = buildRecoverySignals(
      memory, lineage, continuityTransitions,
    );

    // ── Primary narrative source ──────────────────────────────────────────────
    const generatedFrom: NarrativeSource =
      memory.degradationPeriods.length > 0       ? 'CONTINUITY' :
      lineage.successfulCount > 0                ? 'PLAYBOOK'   :
      timeline.milestones.length > 0             ? 'MILESTONES' :
      events.some((e) => e.category === 'DRIFT') ? 'DRIFT'      :
      'TIMELINE';

    // ── Confidence (Refinement B) ─────────────────────────────────────────────
    const confidence: ConfidenceLevel =
      (replay.snapshots.length >= 10 && scanCount >= 3 && windowDays >= 90) ? 'HIGH'   :
      (replay.snapshots.length >= 3  && scanCount >= 1)                      ? 'MEDIUM' :
      'LOW';

    // ── Memory density (Refinement 7 — forwarded) ─────────────────────────────
    const memoryDensity: MemoryDensity = memory.memoryDensity;

    // ── Lineage (Refinement A) ────────────────────────────────────────────────
    const traceReferences = [...new Set([
      ...timeline.traceReferences,
      ...lineage.traceReferences,
    ])].slice(0, 20);
    const relatedEventIds = [...new Set([
      ...timeline.relatedEventIds,
      ...lineage.relatedEventIds,
    ])].slice(0, 30);
    const sourceEntityIds = [...new Set([
      ...timeline.sourceEntityIds,
      ...lineage.sourceEntityIds,
    ])].slice(0, 30);

    return {
      organizationId,
      operationalStateSummary,
      dominantRiskFactors:      dominantRiskFactors.slice(0, 5),
      strongestRecoverySignals: strongestRecoverySignals.slice(0, 5),
      continuityTrend,
      generatedFrom,
      memoryDensity,
      confidence,
      replayVersion:            'v1',
      generatedAt,
      windowDays,
      traceReferences,
      relatedEventIds,
      sourceEntityIds,
      generatedFromWindow:      timeline.generatedFromWindow,
    };
  }

  static generateForOrgs(
    orgIds:   string[],
    timelines:Map<string, OrganizationalTimeline>,
    memories: Map<string, OperationalMemory>,
    replays:  Map<string, ContinuityReplay>,
    lineages: Map<string, InterventionLineageReport>,
    orgNames: Map<string, string>,
  ): OrganizationalNarrative[] {
    const results: OrganizationalNarrative[] = [];
    for (const orgId of orgIds) {
      const tl  = timelines.get(orgId);
      const mem = memories.get(orgId);
      const rep = replays.get(orgId);
      const lin = lineages.get(orgId);
      if (!tl || !mem || !rep || !lin) continue;
      const name = orgNames.get(orgId) ?? orgId;
      results.push(OrganizationalNarrativeService.generateForOrg(tl, mem, rep, lin, name));
    }
    return results;
  }
}

// ── Template builders ─────────────────────────────────────────────────────────

function buildSummary(
  orgName:         string,
  windowDays:      number,
  scanCount:       number,
  recCount:        number,
  assertionCount:  number,
  currentState:    string,
  currentScore:    number | null,
  trend:           ContinuityTrend,
  degradationCount:number,
  recoveryCount:   number,
): string {
  const parts: string[] = [];

  // Core factual statement
  parts.push(
    `${orgName} completed ${scanCount} scan(s) and ${recCount} recommendation action(s) ` +
    `in the last ${windowDays} days.`,
  );

  // Current state
  if (currentScore !== null) {
    parts.push(
      `Current operational continuity state is ${currentState} (proxy score: ${currentScore}/100).`,
    );
  } else {
    parts.push(`Current operational continuity state is ${currentState}.`);
  }

  // Trend (calm language — Refinement 6)
  if (trend === 'IMPROVING') {
    parts.push('Continuity indicators show improvement over the observed period.');
  } else if (trend === 'DECLINING') {
    parts.push(
      assertionCount > 0
        ? `Continuity declined during the observed period, coinciding with ${assertionCount} assertion event(s).`
        : 'Continuity declined during the observed period.',
    );
  }

  // Degradation/recovery (calm language — no dramatic phrasing)
  if (degradationCount > 0 && recoveryCount > 0) {
    parts.push(`${degradationCount} period(s) of elevated concern were observed, with ${recoveryCount} recovery period(s) detected.`);
  } else if (degradationCount > 0) {
    parts.push(`${degradationCount} period(s) of elevated assertion activity were observed without confirmed recovery.`);
  }

  return parts.join(' ');
}

function buildRiskFactors(
  events:      ReturnType<typeof Array.prototype.slice>,
  memory:      OperationalMemory,
  lineage:     InterventionLineageReport,
  transitions: any[],
): string[] {
  const risks: string[] = [];

  // Unresolved patterns
  for (const p of memory.unresolvedPatterns.slice(0, 3)) {
    risks.push(`${p.eventType} has recurred ${p.occurrenceCount} time(s) without resolution.`);
  }

  // Failed interventions
  if (lineage.failedCount > 0) {
    risks.push(`${lineage.failedCount} intervention(s) did not result in observable improvement.`);
  }

  // Continuity collapses (without recovery)
  const collapses = transitions.filter(
    (t: any) => (t.to === 'STALLED' || t.to === 'FRAGMENTED'),
  );
  const recoveries = transitions.filter(
    (t: any) => (t.from === 'STALLED' || t.from === 'FRAGMENTED') &&
                (t.to === 'WATCHING' || t.to === 'HEALTHY'),
  );
  if (collapses.length > recoveries.length) {
    risks.push('Continuity declined without full recovery in the observed window.');
  }

  // Operational debt
  for (const p of memory.unresolvedPatterns.slice(0, 2)) {
    if (risks.some((r) => r.includes(p.eventType))) continue;
    risks.push(`Ongoing ${p.debtCategory.toLowerCase()} operational debt detected.`);
  }

  return [...new Set(risks)];
}

function buildRecoverySignals(
  memory:   OperationalMemory,
  lineage:  InterventionLineageReport,
  transitions: any[],
): string[] {
  const signals: string[] = [];

  if (lineage.successfulCount > 0) {
    signals.push(`${lineage.successfulCount} intervention(s) resulted in measurable improvement.`);
  }

  if (memory.recoveryPeriods.length > 0) {
    const latest = memory.recoveryPeriods[memory.recoveryPeriods.length - 1];
    signals.push(`Recovery period detected starting at ${new Date(latest.startAt).toLocaleDateString()}.`);
  }

  // Continuity recoveries in transitions
  const recoveries = transitions.filter(
    (t: any) => (t.from === 'STALLED' || t.from === 'FRAGMENTED') &&
                (t.to === 'WATCHING' || t.to === 'HEALTHY'),
  );
  if (recoveries.length > 0) {
    signals.push(`Continuity improved from a lower state on ${recoveries.length} occasion(s).`);
  }

  if (lineage.lineages.some((l) => l.causalityStrength === 'STRONG' && l.outcome === 'SUCCESSFUL')) {
    signals.push('At least one intervention shows strong causal correlation with positive outcomes.');
  }

  return [...new Set(signals)];
}

// ── Continuity trend from replay snapshots ────────────────────────────────────

function deriveContinuityTrend(replay: ContinuityReplay): ContinuityTrend {
  const scores = replay.snapshots.map((s) => s.proxyScore);
  if (scores.length < 4) return 'STABLE';

  const mid      = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, mid);
  const secondHalf= scores.slice(mid);
  const avg      = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const firstAvg  = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  const delta     = secondAvg - firstAvg;

  if (delta > 5)  return 'IMPROVING';
  if (delta < -5) return 'DECLINING';
  return 'STABLE';
}
