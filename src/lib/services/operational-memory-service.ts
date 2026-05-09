/**
 * @fileOverview OperationalMemoryService — Sprint 7 Task 2.
 *
 * Reconstructs meaningful operational patterns from event history.
 * Pure function — consumes OrganizationalTimeline, no additional DB queries.
 *
 * Produces:
 *   - operationalPhases    grouped 30d windows by dominant signal
 *   - degradationPeriods   stretches of elevated assertion/failure events
 *   - recoveryPeriods      stretches of improving state after degradation
 *   - interventionChains   ASSERTION → RECOMMENDATION → SCAN delta sequences
 *   - unresolvedPatterns   recurring event types with no subsequent improvement
 *
 * Philosophy: deterministic reconstruction from event sequence.
 * No LLM. No generative narrative. Calm operational truth.
 *
 * Refinements:
 *   4:  debtCategory on UnresolvedPattern
 *   7:  memoryDensity on OperationalMemory
 *   A:  traceReferences, relatedEventIds, sourceEntityIds
 *   B:  confidence scoring
 *   D:  replayVersion, generatedAt, windowDays
 *   9:  generatedFromWindow: { start, end }
 */

import type {
  OrganizationalTimeline,
  TimelineEvent,
  ContinuityTransition,
} from './organizational-timeline-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OperationalPhaseLabel = 'ONBOARDING' | 'ACTIVATING' | 'STABLE' | 'DEGRADING' | 'RECOVERING' | 'DORMANT';
export type MemoryDensity         = 'SPARSE' | 'MODERATE' | 'RICH';   // Refinement 7
export type ConfidenceLevel       = 'LOW' | 'MEDIUM' | 'HIGH';

// Refinement 4 — operational debt categories
export type DebtCategory = 'WORKFLOW' | 'ONBOARDING' | 'RANKING' | 'SCHEDULING' | 'ASSERTION' | 'ENGAGEMENT';

export interface OperationalPhase {
  phaseLabel:    OperationalPhaseLabel;
  startAt:       string;
  endAt:         string;
  durationDays:  number;
  eventCount:    number;
  scanCount:     number;
  description:   string;
  traceReferences:  string[];
  sourceEntityIds:  string[];
}

export interface DegradationPeriod {
  startAt:         string;
  endAt:           string;
  durationDays:    number;
  peakSeverity:    'WARNING' | 'ERROR' | 'CRITICAL';
  assertionCount:  number;
  triggerEvents:   string[];   // eventIds that opened the period
  description:     string;
}

export interface RecoveryPeriod {
  startAt:         string;
  endAt:           string;
  durationDays:    number;
  followedDegradationAt?: string;
  improvingScans:  number;     // consecutive scans with improving scores
  description:     string;
}

export interface InterventionChain {
  chainId:          string;    // `chain:${triggerEventId}:${recId}`
  triggerEventId:   string;    // assertion operational event that preceded
  triggerType:      string;
  triggerAt:        string;
  recommendationId: string;
  recCompletedAt:   string;
  recCategory:      string;
  scanId?:          string;    // first scan after rec completion
  scanCompletedAt?: string;
  scoreBefore?:     number;
  scoreAfter?:      number;
  scoreDelta?:      number;
  description:      string;
}

export interface UnresolvedPattern {
  patternId:       string;       // `pattern:${eventType}:${orgId}`
  eventType:       string;
  occurrenceCount: number;
  firstSeenAt:     string;
  lastSeenAt:      string;
  debtCategory:    DebtCategory; // Refinement 4
  description:     string;
  relatedEventIds: string[];
}

export interface OperationalMemory {
  organizationId:    string;
  operationalPhases: OperationalPhase[];
  degradationPeriods:DegradationPeriod[];
  recoveryPeriods:   RecoveryPeriod[];
  interventionChains:InterventionChain[];
  unresolvedPatterns:UnresolvedPattern[];
  memoryDensity:     MemoryDensity;    // Refinement 7
  confidence:        ConfidenceLevel;  // Refinement B
  replayVersion:     'v1';             // Refinement D
  generatedAt:       string;
  windowDays:        number;
  traceReferences:   string[];         // Refinement A
  relatedEventIds:   string[];         // Refinement A
  sourceEntityIds:   string[];         // Refinement A
  generatedFromWindow: { start: string; end: string }; // Refinement 9
}

// ── DebtCategory classification ───────────────────────────────────────────────

function classifyDebt(eventType: string): DebtCategory {
  if (eventType.includes('SCAN') || eventType.includes('FREE_SCAN')) return 'WORKFLOW';
  if (eventType.includes('ONBOARDING') || eventType.includes('USER')) return 'ONBOARDING';
  if (eventType.includes('RANKING'))    return 'RANKING';
  if (eventType.includes('SCHEDULE'))   return 'SCHEDULING';
  if (eventType.includes('ASSERTION') || eventType.includes('PIPELINE') || eventType.includes('RUNTIME')) return 'ASSERTION';
  return 'ENGAGEMENT';
}

// ── OperationalMemoryService ──────────────────────────────────────────────────

export class OperationalMemoryService {
  /**
   * Reconstruct operational memory from a pre-built timeline.
   * Pure function — no DB queries.
   */
  static reconstructForOrg(timeline: OrganizationalTimeline): OperationalMemory {
    const { organizationId, events, continuityTransitions, windowDays, generatedFromWindow } = timeline;
    const generatedAt = new Date().toISOString();

    // ── Operational phases (30d window groupings) ─────────────────────────────
    const operationalPhases: OperationalPhase[] = buildPhases(events, continuityTransitions, windowDays);

    // ── Degradation periods ───────────────────────────────────────────────────
    const degradationPeriods: DegradationPeriod[] = detectDegradation(events, continuityTransitions);

    // ── Recovery periods ──────────────────────────────────────────────────────
    const recoveryPeriods: RecoveryPeriod[] = detectRecovery(events, continuityTransitions, degradationPeriods);

    // ── Intervention chains ───────────────────────────────────────────────────
    const interventionChains: InterventionChain[] = buildInterventionChains(events);

    // ── Unresolved patterns ───────────────────────────────────────────────────
    const unresolvedPatterns: UnresolvedPattern[] = detectUnresolvedPatterns(
      organizationId, events, interventionChains,
    );

    // ── Memory density (Refinement 7) ─────────────────────────────────────────
    const memoryDensity: MemoryDensity =
      events.length > 20 && timeline.milestones.length >= 2 ? 'RICH'   :
      events.length >= 5  || timeline.milestones.length >= 1 ? 'MODERATE' :
      'SPARSE';

    // ── Confidence (Refinement B) ─────────────────────────────────────────────
    const scanEvents = events.filter((e) => e.category === 'SCAN');
    const confidence: ConfidenceLevel =
      (scanEvents.length >= 3 && events.length >= 10 && windowDays >= 90) ? 'HIGH'   :
      (scanEvents.length >= 1 && events.length >= 3)                       ? 'MEDIUM' :
      'LOW';

    // ── Lineage (Refinement A) ────────────────────────────────────────────────
    const traceReferences = [...new Set(events.flatMap((e) => e.traceReferences))].slice(0, 20);
    const relatedEventIds = [...new Set(events.flatMap((e) => e.relatedEventIds))].slice(0, 30);
    const sourceEntityIds = [...new Set(events.flatMap((e) => e.sourceEntityIds))].slice(0, 30);

    return {
      organizationId,
      operationalPhases,
      degradationPeriods,
      recoveryPeriods,
      interventionChains,
      unresolvedPatterns,
      memoryDensity,
      confidence,
      replayVersion:     'v1',
      generatedAt,
      windowDays,
      traceReferences,
      relatedEventIds,
      sourceEntityIds,
      generatedFromWindow,
    };
  }

  static reconstructForOrgs(timelines: OrganizationalTimeline[]): OperationalMemory[] {
    return timelines.map((t) => OperationalMemoryService.reconstructForOrg(t));
  }
}

// ── Phase construction ────────────────────────────────────────────────────────

function buildPhases(
  events: TimelineEvent[],
  transitions: ContinuityTransition[],
  windowDays: number,
): OperationalPhase[] {
  if (events.length === 0) return [];

  const phases: OperationalPhase[] = [];

  // Detect onboarding phase: events before first SCAN
  const firstScan = events.find((e) => e.category === 'SCAN');
  const onboardingEvents = firstScan
    ? events.filter((e) => e.timestamp < firstScan.timestamp && e.category === 'ONBOARDING')
    : [];

  if (onboardingEvents.length > 0) {
    const start = onboardingEvents[0].timestamp;
    const end   = firstScan?.timestamp ?? onboardingEvents[onboardingEvents.length - 1].timestamp;
    phases.push({
      phaseLabel:   'ONBOARDING',
      startAt:      start,
      endAt:        end,
      durationDays: daysBetween(start, end),
      eventCount:   onboardingEvents.length,
      scanCount:    0,
      description:  'Organization in onboarding — no scans completed yet.',
      traceReferences:  [],
      sourceEntityIds:  onboardingEvents.map((e) => e.sourceId),
    });
  }

  // Segment remaining events into 30d windows
  if (events.length === 0) return phases;
  const windowMs = 30 * 24 * 60 * 60 * 1000;
  const startTs  = new Date(events[0].timestamp).getTime();
  const endTs    = new Date(events[events.length - 1].timestamp).getTime();
  const totalMs  = endTs - startTs;
  const numWindows = Math.max(1, Math.ceil(totalMs / windowMs));

  for (let w = 0; w < numWindows; w++) {
    const wStart = new Date(startTs + w * windowMs);
    const wEnd   = new Date(Math.min(startTs + (w + 1) * windowMs, endTs + 1));
    const wEvents = events.filter(
      (e) => new Date(e.timestamp) >= wStart && new Date(e.timestamp) < wEnd,
    );
    if (wEvents.length === 0) continue;

    const scanCount     = wEvents.filter((e) => e.category === 'SCAN').length;
    const assertionCount= wEvents.filter((e) => e.category === 'ASSERTION').length;
    const hasCritical   = wEvents.some((e) => e.severity === 'CRITICAL');
    const hasRecovery   = wEvents.some((e) => e.category === 'CONTINUITY');

    // Phase label from dominant signal
    const phaseLabel: OperationalPhaseLabel =
      scanCount === 0 && assertionCount === 0 ? 'DORMANT'    :
      hasCritical                              ? 'DEGRADING'  :
      assertionCount > scanCount               ? 'DEGRADING'  :
      hasRecovery                              ? 'RECOVERING' :
      scanCount >= 2                           ? 'STABLE'     :
      scanCount === 1                          ? 'ACTIVATING' :
      'STABLE';

    phases.push({
      phaseLabel,
      startAt:      wStart.toISOString(),
      endAt:        wEnd.toISOString(),
      durationDays: Math.round((wEnd.getTime() - wStart.getTime()) / (1000 * 60 * 60 * 24)),
      eventCount:   wEvents.length,
      scanCount,
      description:  describePhase(phaseLabel, scanCount, assertionCount),
      traceReferences:  [],
      sourceEntityIds:  wEvents.map((e) => e.sourceId).slice(0, 10),
    });
  }

  return phases;
}

function describePhase(label: OperationalPhaseLabel, scans: number, assertions: number): string {
  switch (label) {
    case 'STABLE':     return `${scans} scan(s) completed with no critical failures detected.`;
    case 'DEGRADING':  return `Elevated assertion events (${assertions}) detected with ${scans} scan(s).`;
    case 'RECOVERING': return `Recovery indicators detected — continuity concerns were present but improving.`;
    case 'ACTIVATING': return `Initial operational activation — ${scans} scan(s) completed.`;
    case 'DORMANT':    return 'Minimal operational activity detected in this period.';
    case 'ONBOARDING': return 'Organization in initial onboarding phase.';
  }
}

// ── Degradation detection ─────────────────────────────────────────────────────

function detectDegradation(
  events: TimelineEvent[],
  transitions: ContinuityTransition[],
): DegradationPeriod[] {
  const periods: DegradationPeriod[] = [];
  const assertionEvents = events.filter((e) => e.category === 'ASSERTION' || e.category === 'CONTINUITY');

  // Group assertion events within 7-day clusters
  let clusterStart: Date | null = null;
  let clusterEnd:   Date | null = null;
  let clusterEvents: TimelineEvent[] = [];

  for (const ev of assertionEvents) {
    const ts = new Date(ev.timestamp);
    if (!clusterStart) {
      clusterStart = ts;
      clusterEnd   = ts;
      clusterEvents = [ev];
    } else if (ts.getTime() - clusterEnd!.getTime() <= 7 * 24 * 60 * 60 * 1000) {
      clusterEnd   = ts;
      clusterEvents.push(ev);
    } else {
      if (clusterEvents.length >= 2) {
        periods.push(makeDegradationPeriod(clusterStart!, clusterEnd!, clusterEvents));
      }
      clusterStart = ts;
      clusterEnd   = ts;
      clusterEvents = [ev];
    }
  }
  if (clusterEvents.length >= 2 && clusterStart && clusterEnd) {
    periods.push(makeDegradationPeriod(clusterStart, clusterEnd, clusterEvents));
  }

  // Also include continuity collapse transitions
  for (const t of transitions) {
    if ((t.from === 'HEALTHY' || t.from === 'WATCHING') &&
        (t.to === 'FRAGMENTED' || t.to === 'STALLED')) {
      const ts = new Date(t.changedAt);
      const endTs = new Date(ts.getTime() + 24 * 60 * 60 * 1000); // at least 1d period
      const alreadyCovered = periods.some((p) =>
        new Date(p.startAt) <= ts && new Date(p.endAt) >= ts,
      );
      if (!alreadyCovered) {
        periods.push({
          startAt:        t.changedAt,
          endAt:          endTs.toISOString(),
          durationDays:   1,
          peakSeverity:   'WARNING',
          assertionCount: 0,
          triggerEvents:  [t.scanId],
          description:    `Continuity declined from ${t.from} to ${t.to} (score: ${t.scoreBefore} → ${t.scoreAfter}).`,
        });
      }
    }
  }

  return periods.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

function makeDegradationPeriod(
  start: Date, end: Date, events: TimelineEvent[],
): DegradationPeriod {
  const peakSeverity: 'WARNING' | 'ERROR' | 'CRITICAL' =
    events.some((e) => e.severity === 'CRITICAL') ? 'CRITICAL' :
    events.some((e) => e.severity === 'ERROR')    ? 'ERROR'    : 'WARNING';
  return {
    startAt:        start.toISOString(),
    endAt:          end.toISOString(),
    durationDays:   Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))),
    peakSeverity,
    assertionCount: events.length,
    triggerEvents:  events.slice(0, 3).map((e) => e.eventId),
    description:    `${events.length} assertion/continuity event(s) in a ${Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))}-day period.`,
  };
}

// ── Recovery detection ────────────────────────────────────────────────────────

function detectRecovery(
  events: TimelineEvent[],
  transitions: ContinuityTransition[],
  degradationPeriods: DegradationPeriod[],
): RecoveryPeriod[] {
  const periods: RecoveryPeriod[] = [];

  for (const t of transitions) {
    if ((t.from === 'STALLED' || t.from === 'FRAGMENTED') &&
        (t.to === 'WATCHING' || t.to === 'HEALTHY')) {
      const precedingDegradation = degradationPeriods
        .filter((d) => d.endAt <= t.changedAt)
        .sort((a, b) => b.endAt.localeCompare(a.endAt))[0];

      const recoveryEnd = events
        .filter((e) => e.timestamp > t.changedAt && e.category === 'SCAN')
        .slice(0, 2);

      const endAt = recoveryEnd.length > 0
        ? recoveryEnd[recoveryEnd.length - 1].timestamp
        : t.changedAt;

      periods.push({
        startAt:                  t.changedAt,
        endAt,
        durationDays:             Math.max(1, daysBetween(t.changedAt, endAt)),
        followedDegradationAt:    precedingDegradation?.startAt,
        improvingScans:           recoveryEnd.length,
        description:              `Continuity recovered from ${t.from} to ${t.to} (score: ${t.scoreBefore} → ${t.scoreAfter}).`,
      });
    }
  }

  return periods;
}

// ── Intervention chain construction ──────────────────────────────────────────

function buildInterventionChains(events: TimelineEvent[]): InterventionChain[] {
  const chains: InterventionChain[] = [];
  const assertionEvents  = events.filter((e) => e.category === 'ASSERTION');
  const recEvents        = events.filter((e) => e.category === 'RECOMMENDATION' && !e.description.includes('dismissed'));
  const scanEvents       = events.filter((e) => e.category === 'SCAN' && e.description.includes('completed'));

  for (const rec of recEvents) {
    // Find assertion within 14d before the recommendation
    const recTs = new Date(rec.timestamp);
    const trigger = assertionEvents.find((a) => {
      const aTs = new Date(a.timestamp);
      return aTs < recTs && recTs.getTime() - aTs.getTime() <= 14 * 24 * 60 * 60 * 1000;
    });

    if (!trigger) continue;

    // Find first scan after rec completion
    const nextScan = scanEvents.find((s) => s.timestamp > rec.timestamp);

    chains.push({
      chainId:          `chain:${trigger.eventId}:${rec.sourceId}`,
      triggerEventId:   trigger.eventId,
      triggerType:      trigger.title,
      triggerAt:        trigger.timestamp,
      recommendationId: rec.sourceId,
      recCompletedAt:   rec.timestamp,
      recCategory:      rec.description.split('(')[0]?.trim() ?? 'unknown',
      scanId:           nextScan?.sourceId,
      scanCompletedAt:  nextScan?.timestamp,
      description:      `${trigger.title} → ${rec.title}${nextScan ? ` → subsequent scan` : ''}.`,
    });
  }

  return chains.slice(0, 20);
}

// ── Unresolved pattern detection ──────────────────────────────────────────────

function detectUnresolvedPatterns(
  orgId: string,
  events: TimelineEvent[],
  chains: InterventionChain[],
): UnresolvedPattern[] {
  const patterns: UnresolvedPattern[] = [];
  const resolvedTriggerIds = new Set(chains.map((c) => c.triggerEventId));

  // Count assertion events by type
  const assertionsByType = new Map<string, TimelineEvent[]>();
  for (const ev of events.filter((e) => e.category === 'ASSERTION')) {
    const existing = assertionsByType.get(ev.title) ?? [];
    existing.push(ev);
    assertionsByType.set(ev.title, existing);
  }

  for (const [eventType, evList] of assertionsByType) {
    if (evList.length < 2) continue;

    // Check if any were resolved via intervention chain
    const hasResolution = evList.some((e) => resolvedTriggerIds.has(e.eventId));
    if (hasResolution) continue;

    patterns.push({
      patternId:       `pattern:${eventType}:${orgId}`,
      eventType,
      occurrenceCount: evList.length,
      firstSeenAt:     evList[0].timestamp,
      lastSeenAt:      evList[evList.length - 1].timestamp,
      debtCategory:    classifyDebt(eventType),
      description:     `${eventType} has occurred ${evList.length} time(s) without a linked intervention.`,
      relatedEventIds: evList.map((e) => e.eventId).slice(0, 10),
    });
  }

  return patterns;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24),
  ));
}
