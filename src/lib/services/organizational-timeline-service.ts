/**
 * @fileOverview OrganizationalTimelineService — Sprint 7 Task 1.
 *
 * Constructs deterministic operational timelines per organization.
 * This is the temporal substrate for all Sprint 7 memory services.
 *
 * Event sources → category mapping:
 *   SCAN         PerceptionScan (started, completed, failed)
 *   RECOMMENDATION  Recommendation (actioned, completed, dismissed)
 *   ASSERTION    OperationalEvent assertion types (pipeline failures)
 *   SYSTEM       OperationalEvent system/admin types
 *   ONBOARDING   OperationalEvent user lifecycle + org.createdAt
 *   RANKING      OperationalEvent ranking types
 *   CONTINUITY   OperationalEvent ORGANIZATIONAL_CONTINUITY_RISK / OPERATIONAL_SILENCE_DETECTED
 *   PLAYBOOK     Derived from high-severity CONTINUITY events (no separate persistence)
 *   SCHEDULE     ScanSchedule activations / creations
 *   DRIFT        Derived from consecutive scan score deltas (>10 points)
 *   NOTIFICATION OperationalEvent ONBOARDING_COMPLETED (engagement proxy)
 *
 * Refinements:
 *   A:  traceReferences, relatedEventIds, sourceEntityIds on all outputs
 *   D:  replayVersion: 'v1', generatedAt, windowDays
 *   8:  significantMoments — CRITICAL/ERROR events + continuity transitions
 *   9:  generatedFromWindow: { start, end }
 */

import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimelineCategory =
  | 'ONBOARDING'
  | 'SCAN'
  | 'RECOMMENDATION'
  | 'RANKING'
  | 'DRIFT'
  | 'CONTINUITY'
  | 'PLAYBOOK'
  | 'NOTIFICATION'
  | 'ASSERTION'
  | 'SCHEDULE'
  | 'SYSTEM';

export type TimelineSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type ContinuityStateLabel = 'HEALTHY' | 'WATCHING' | 'FRAGMENTED' | 'STALLED' | 'UNKNOWN';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TimelineEvent {
  eventId:          string;          // `${sourceTable}:${sourceId}` — deterministic
  category:         TimelineCategory;
  timestamp:        string;          // ISO8601
  severity:         TimelineSeverity;
  title:            string;
  description:      string;
  sourceTable:      string;
  sourceId:         string;
  // Refinement A — lineage
  traceReferences:  string[];
  relatedEventIds:  string[];
  sourceEntityIds:  string[];
}

export interface ContinuityTransition {
  scanId:       string;
  changedAt:    string;
  from:         ContinuityStateLabel;
  to:           ContinuityStateLabel;
  scoreBefore:  number;
  scoreAfter:   number;
  likelyDrivers:string[];
}

export interface InterventionRecord {
  interventionId: string;        // recommendation.id
  completedAt:    string;
  category:       string;
  priority:       string;
}

// OperationalMilestone defined here (temporal substrate) — used by Task 3
export interface OperationalMilestone {
  milestoneType:    string;
  achievedAt:       string;
  significance:     'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  persistenceScore: number;       // 0–100 (Refinement 3)
  derivedFrom:      string[];
  explanation:      string;
  // Refinement A
  traceReferences:  string[];
  relatedEventIds:  string[];
  sourceEntityIds:  string[];
}

export interface OrganizationalTimeline {
  organizationId:        string;
  generatedAt:           string;
  windowDays:            30 | 90 | 365;
  events:                TimelineEvent[];
  milestones:            OperationalMilestone[];    // populated by Task 3 in route
  continuityTransitions: ContinuityTransition[];
  majorInterventions:    InterventionRecord[];
  significantMoments:    TimelineEvent[];            // Refinement 8
  confidence:            ConfidenceLevel;
  replayVersion:         'v1';                       // Refinement D
  traceReferences:       string[];                   // Refinement A
  relatedEventIds:       string[];                   // Refinement A
  sourceEntityIds:       string[];                   // Refinement A
  generatedFromWindow:   { start: string; end: string }; // Refinement 9
}

// ── Event type → category mapping ─────────────────────────────────────────────

const ASSERTION_TYPES = new Set([
  'FREE_SCAN_PIPELINE_INCOMPLETE',
  'PUBLIC_RUNTIME_FLOW_BROKEN',
  'RANKING_PIPELINE_INCOMPLETE',
  'SYSTEM_RUNTIME_DEGRADATION',
]);

const RANKING_TYPES  = new Set(['RANKING_SNAPSHOT_GENERATED', 'RANKING_PIPELINE_INCOMPLETE']);
const ONBOARDING_TYPES = new Set(['USER_PROVISIONED', 'ONBOARDING_COMPLETED']);
const SCAN_TYPES = new Set(['SCAN_STARTED', 'SCAN_COMPLETED', 'SCAN_FAILED', 'FREE_SCAN_STARTED', 'FREE_SCAN_COMPLETED']);
const CONTINUITY_TYPES = new Set(['ORGANIZATIONAL_CONTINUITY_RISK', 'OPERATIONAL_SILENCE_DETECTED']);
const SYSTEM_TYPES = new Set(['ADMIN_ACTION', 'SHARE_PAGE_ACCESSED', 'PROVISIONING_REPLAY']);

function eventTypeToCategory(eventType: string): TimelineCategory {
  if (CONTINUITY_TYPES.has(eventType))  return 'CONTINUITY';
  if (ASSERTION_TYPES.has(eventType))   return 'ASSERTION';
  if (RANKING_TYPES.has(eventType))     return 'RANKING';
  if (ONBOARDING_TYPES.has(eventType))  return 'ONBOARDING';
  if (SCAN_TYPES.has(eventType))        return 'SCAN';
  if (SYSTEM_TYPES.has(eventType))      return 'SYSTEM';
  return 'SYSTEM';
}

function severityToTimelineSeverity(s: string): TimelineSeverity {
  if (s === 'CRITICAL') return 'CRITICAL';
  if (s === 'ERROR')    return 'ERROR';
  if (s === 'WARNING')  return 'WARNING';
  return 'INFO';
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function meanScore(r: {
  accuracyScore: number;
  coverageScore: number;
  entityUnderstandingScore: number;
  consistencyScore: number;
}): number {
  return (r.accuracyScore + r.coverageScore + r.entityUnderstandingScore + r.consistencyScore) / 4;
}

function scoreToState(score: number): ContinuityStateLabel {
  if (score >= 70) return 'HEALTHY';
  if (score >= 45) return 'WATCHING';
  if (score >= 20) return 'FRAGMENTED';
  return 'STALLED';
}

// ── OrganizationalTimelineService ─────────────────────────────────────────────

export class OrganizationalTimelineService {
  /**
   * Build timelines for multiple organizations.
   * All DB queries are batched; per-org construction is in-memory.
   */
  static async buildForOrgs(
    orgIds:    string[],
    orgs:      { id: string; createdAt: Date }[],
    windowDays: 30 | 90 | 365 = 90,
  ): Promise<OrganizationalTimeline[]> {
    if (orgIds.length === 0) return [];

    const now         = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // ── Batch queries (parallel) ──────────────────────────────────────────────
    const [scans, recs, opEvents, schedules] = await Promise.all([

      db.perceptionScan.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: windowStart },
        },
        select: {
          id: true, organizationId: true, status: true,
          createdAt: true, completedAt: true,
          scanReport: {
            select: {
              accuracyScore: true, coverageScore: true,
              entityUnderstandingScore: true, consistencyScore: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),

      // Recommendations with action/completion in window (joined through scan)
      db.recommendation.findMany({
        where: {
          OR: [
            { completedAt: { gte: windowStart } },
            { actionedAt:  { gte: windowStart } },
          ],
          perceptionScan: { organizationId: { in: orgIds } },
        },
        select: {
          id: true, status: true, category: true, priority: true,
          completedAt: true, actionedAt: true,
          perceptionScan: { select: { id: true, organizationId: true } },
        },
        orderBy: { completedAt: 'asc' },
      }),

      // Operational events in window
      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: windowStart },
        },
        select: {
          id: true, organizationId: true, eventType: true,
          severity: true, message: true, traceId: true, createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),

      // Schedules created or activated in window
      db.scanSchedule.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt:      { gte: windowStart },
        },
        select: {
          id: true, organizationId: true, isActive: true,
          interval: true, createdAt: true, lastRunAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // ── Build lookup maps ─────────────────────────────────────────────────────
    const scansByOrg    = groupBy(scans,    (s) => s.organizationId);
    const recsByOrg     = new Map<string, typeof recs>();
    for (const r of recs) {
      if (!r.perceptionScan) continue;
      const oid = r.perceptionScan.organizationId;
      const existing = recsByOrg.get(oid) ?? [];
      existing.push(r);
      recsByOrg.set(oid, existing);
    }
    const opEventsByOrg = groupBy(
      opEvents.filter((e): e is typeof opEvents[0] & { organizationId: string } =>
        e.organizationId !== null),
      (e) => e.organizationId,
    );
    const schedsByOrg   = groupBy(schedules, (s) => s.organizationId);
    const orgMeta       = new Map(orgs.map((o) => [o.id, o]));

    // ── Build per org ─────────────────────────────────────────────────────────
    const generatedAt = new Date().toISOString();
    const results: OrganizationalTimeline[] = [];

    for (const orgId of orgIds) {
      const org       = orgMeta.get(orgId);
      const orgScans  = scansByOrg.get(orgId)    ?? [];
      const orgRecs   = recsByOrg.get(orgId)      ?? [];
      const orgEvents = opEventsByOrg.get(orgId)  ?? [];
      const orgScheds = schedsByOrg.get(orgId)    ?? [];

      const events: TimelineEvent[] = [];
      const allSourceEntityIds: string[] = [];
      const allTraceRefs: string[] = [];
      const allRelatedEventIds: string[] = [];

      // ── SCAN events ────────────────────────────────────────────────────────
      for (const scan of orgScans) {
        const ts = (scan.completedAt ?? scan.createdAt).toISOString();
        const status = scan.status;
        const score  = scan.scanReport ? +meanScore(scan.scanReport).toFixed(1) : null;
        const sev: TimelineSeverity =
          status === 'FAILED' ? 'WARNING' :
          status === 'PARTIAL' ? 'INFO' : 'INFO';
        events.push({
          eventId:       `perception_scans:${scan.id}`,
          category:      'SCAN',
          timestamp:     ts,
          severity:      sev,
          title:         `Scan ${status.toLowerCase()}`,
          description:   score !== null
            ? `Perception scan ${status.toLowerCase()} with mean score ${score}.`
            : `Perception scan ${status.toLowerCase()}.`,
          sourceTable:   'perception_scans',
          sourceId:      scan.id,
          traceReferences:  [],
          relatedEventIds:  [],
          sourceEntityIds:  [scan.id],
        });
        allSourceEntityIds.push(scan.id);
      }

      // ── RECOMMENDATION events ──────────────────────────────────────────────
      for (const rec of orgRecs) {
        const ts  = (rec.completedAt ?? rec.actionedAt ?? new Date()).toISOString();
        const sev: TimelineSeverity = rec.status === 'DISMISSED' ? 'WARNING' : 'INFO';
        const verb = rec.status === 'COMPLETED' ? 'completed' :
                     rec.status === 'DISMISSED' ? 'dismissed' :
                     rec.status === 'IN_PROGRESS' ? 'started' : 'actioned';
        events.push({
          eventId:       `recommendations:${rec.id}`,
          category:      'RECOMMENDATION',
          timestamp:     ts,
          severity:      sev,
          title:         `Recommendation ${verb}`,
          description:   `${rec.category} (${rec.priority} priority) recommendation ${verb}.`,
          sourceTable:   'recommendations',
          sourceId:      rec.id,
          traceReferences:  [],
          relatedEventIds:  rec.perceptionScan ? [rec.perceptionScan.id] : [],
          sourceEntityIds:  rec.perceptionScan ? [rec.id, rec.perceptionScan.id] : [rec.id],
        });
        allSourceEntityIds.push(rec.id);
      }

      // ── OperationalEvent-derived timeline events ───────────────────────────
      for (const ev of orgEvents) {
        const category  = eventTypeToCategory(ev.eventType);
        const sev       = severityToTimelineSeverity(ev.severity);
        events.push({
          eventId:       `operational_events:${ev.id}`,
          category,
          timestamp:     ev.createdAt.toISOString(),
          severity:      sev,
          title:         ev.eventType.toLowerCase().replace(/_/g, ' '),
          description:   ev.message,
          sourceTable:   'operational_events',
          sourceId:      ev.id,
          traceReferences:  ev.traceId ? [ev.traceId] : [],
          relatedEventIds:  [ev.id],
          sourceEntityIds:  [ev.id],
        });
        if (ev.traceId) allTraceRefs.push(ev.traceId);
        allRelatedEventIds.push(ev.id);
      }

      // PLAYBOOK events: high-severity CONTINUITY triggers are the recorded playbook moments
      for (const ev of orgEvents.filter((e) => CONTINUITY_TYPES.has(e.eventType) && e.severity === 'CRITICAL')) {
        events.push({
          eventId:       `playbook:${ev.id}`,
          category:      'PLAYBOOK',
          timestamp:     ev.createdAt.toISOString(),
          severity:      'CRITICAL',
          title:         'Playbook-level intervention triggered',
          description:   `${ev.eventType} — ${ev.message}`,
          sourceTable:   'operational_events',
          sourceId:      ev.id,
          traceReferences:  ev.traceId ? [ev.traceId] : [],
          relatedEventIds:  [ev.id],
          sourceEntityIds:  [ev.id],
        });
      }

      // ── SCHEDULE events ────────────────────────────────────────────────────
      for (const sched of orgScheds) {
        events.push({
          eventId:       `scan_schedules:${sched.id}`,
          category:      'SCHEDULE',
          timestamp:     sched.createdAt.toISOString(),
          severity:      'INFO',
          title:         `Scan schedule ${sched.isActive ? 'activated' : 'created'}`,
          description:   `${sched.interval} scan schedule ${sched.isActive ? 'activated' : 'created'}.`,
          sourceTable:   'scan_schedules',
          sourceId:      sched.id,
          traceReferences:  [],
          relatedEventIds:  [],
          sourceEntityIds:  [sched.id],
        });
        allSourceEntityIds.push(sched.id);
      }

      // ── ONBOARDING anchor event (org creation) ─────────────────────────────
      if (org && org.createdAt >= windowStart) {
        events.push({
          eventId:       `organizations:${orgId}:created`,
          category:      'ONBOARDING',
          timestamp:     org.createdAt.toISOString(),
          severity:      'INFO',
          title:         'Organization created',
          description:   'Organization account created and onboarding began.',
          sourceTable:   'organizations',
          sourceId:      orgId,
          traceReferences:  [],
          relatedEventIds:  [],
          sourceEntityIds:  [orgId],
        });
      }

      // ── Sort all events chronologically ───────────────────────────────────
      events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // ── ContinuityTransitions (from consecutive scan pairs with reports) ───
      const continuityTransitions: ContinuityTransition[] = [];
      const scansWithReports = orgScans
        .filter((s) => s.scanReport !== null)
        .sort((a, b) => (a.completedAt ?? a.createdAt).getTime() - (b.completedAt ?? b.createdAt).getTime());

      for (let i = 1; i < scansWithReports.length; i++) {
        const prev = scansWithReports[i - 1];
        const curr = scansWithReports[i];
        const prevScore = +meanScore(prev.scanReport!).toFixed(1);
        const currScore = +meanScore(curr.scanReport!).toFixed(1);
        const prevState = scoreToState(prevScore);
        const currState = scoreToState(currScore);

        if (prevState !== currState) {
          const drivers: string[] = [];
          drivers.push(`Score changed from ${prevScore} to ${currScore}.`);
          const assertionsBetween = orgEvents.filter(
            (e) => ASSERTION_TYPES.has(e.eventType) &&
              e.createdAt > (prev.completedAt ?? prev.createdAt) &&
              e.createdAt <= (curr.completedAt ?? curr.createdAt),
          );
          if (assertionsBetween.length > 0) {
            drivers.push(`${assertionsBetween.length} assertion event(s) detected in the interval.`);
          }
          continuityTransitions.push({
            scanId:       curr.id,
            changedAt:    (curr.completedAt ?? curr.createdAt).toISOString(),
            from:         prevState,
            to:           currState,
            scoreBefore:  prevScore,
            scoreAfter:   currScore,
            likelyDrivers: drivers,
          });
        }

        // DRIFT events from score deltas > 10 (declining)
        if (prevScore - currScore > 10) {
          events.push({
            eventId:       `drift:${prev.id}:${curr.id}`,
            category:      'DRIFT',
            timestamp:     (curr.completedAt ?? curr.createdAt).toISOString(),
            severity:      prevScore - currScore > 20 ? 'WARNING' : 'INFO',
            title:         'Scan score declined',
            description:   `Score declined from ${prevScore} to ${currScore} between consecutive scans.`,
            sourceTable:   'perception_scans',
            sourceId:      curr.id,
            traceReferences:  [],
            relatedEventIds:  [prev.id, curr.id],
            sourceEntityIds:  [prev.id, curr.id],
          });
        }
      }

      // Re-sort after adding drift events
      events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // ── Major interventions (completed recommendations) ────────────────────
      const majorInterventions: InterventionRecord[] = orgRecs
        .filter((r) => r.status === 'COMPLETED' && r.completedAt)
        .map((r) => ({
          interventionId: r.id,
          completedAt:    r.completedAt!.toISOString(),
          category:       r.category,
          priority:       r.priority,
        }))
        .slice(0, 20);

      // ── Significant moments (Refinement 8) ────────────────────────────────
      const transitionTimestamps = new Set(continuityTransitions.map((t) => t.changedAt));
      const significantMoments = events.filter((e) =>
        e.severity === 'CRITICAL' ||
        e.severity === 'ERROR' ||
        e.category === 'CONTINUITY' ||
        e.category === 'PLAYBOOK' ||
        transitionTimestamps.has(e.timestamp),
      );

      // ── Lineage (Refinement A) ────────────────────────────────────────────
      const traceReferences   = [...new Set(allTraceRefs)].slice(0, 20);
      const relatedEventIds   = [...new Set(allRelatedEventIds)].slice(0, 30);
      const sourceEntityIds   = [...new Set(allSourceEntityIds)].slice(0, 30);

      // ── Confidence ────────────────────────────────────────────────────────
      const confidence: ConfidenceLevel =
        (events.length >= 10 && scansWithReports.length >= 3 && windowDays >= 90) ? 'HIGH' :
        (events.length >= 3  && scansWithReports.length >= 1)                      ? 'MEDIUM' :
        'LOW';

      results.push({
        organizationId:        orgId,
        generatedAt,
        windowDays,
        events:                events.slice(0, 200),  // cap to 200 events
        milestones:            [],                    // populated by Task 3
        continuityTransitions,
        majorInterventions,
        significantMoments:    significantMoments.slice(0, 20),
        confidence,
        replayVersion:         'v1',
        traceReferences,
        relatedEventIds,
        sourceEntityIds,
        generatedFromWindow:   {
          start: windowStart.toISOString(),
          end:   now.toISOString(),
        },
      });
    }

    return results;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const existing = map.get(k) ?? [];
    existing.push(item);
    map.set(k, existing);
  }
  return map;
}
