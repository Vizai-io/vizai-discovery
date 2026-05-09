/**
 * @fileOverview OperationalMilestoneService — Sprint 7 Task 3.
 *
 * Detects organizational operational lifecycle landmarks.
 * Combines all-time DB queries (for "first ever" milestones) with timeline
 * event analysis (for transition-based milestones).
 *
 * Milestone types: see OPERATIONAL_MILESTONES const (Refinement E).
 *
 * Refinements:
 *   3:  persistenceScore — how durable was the improvement? (0–100)
 *   E:  OPERATIONAL_MILESTONES taxonomy as const
 *   A:  traceReferences, relatedEventIds, sourceEntityIds
 *   B:  confidence scoring
 */

import { db } from '@/lib/db';
import type { OrganizationalTimeline, OperationalMilestone, ContinuityTransition } from './organizational-timeline-service';

// ── OPERATIONAL_MILESTONES taxonomy (Refinement E) ────────────────────────────

export const OPERATIONAL_MILESTONES = {
  FIRST_SUCCESSFUL_SCAN:         'FIRST_SUCCESSFUL_SCAN',
  FIRST_SCHEDULE_ACTIVATION:     'FIRST_SCHEDULE_ACTIVATION',
  FIRST_POSITIVE_IMPACT:         'FIRST_POSITIVE_IMPACT',
  CONTINUITY_STABILIZED:         'CONTINUITY_STABILIZED',
  VISIBILITY_RECOVERED:          'VISIBILITY_RECOVERED',
  DRIFT_RECOVERED:               'DRIFT_RECOVERED',
  OPERATIONAL_SILENCE_RECOVERED: 'OPERATIONAL_SILENCE_RECOVERED',
  FIRST_STABLE_30D_PERIOD:       'FIRST_STABLE_30D_PERIOD',
  CONTINUITY_COLLAPSE:           'CONTINUITY_COLLAPSE',
  CRITICAL_DEGRADATION_ONSET:    'CRITICAL_DEGRADATION_ONSET',
} as const;

type MilestoneType = (typeof OPERATIONAL_MILESTONES)[keyof typeof OPERATIONAL_MILESTONES];

// ── OperationalMilestoneService ───────────────────────────────────────────────

export class OperationalMilestoneService {
  /**
   * Detect operational milestones for multiple organizations.
   * Combines all-time DB queries (batched) with timeline-derived detection.
   */
  static async detectForOrgs(
    orgIds:    string[],
    timelines: OrganizationalTimeline[],
  ): Promise<Map<string, OperationalMilestone[]>> {
    if (orgIds.length === 0) return new Map();

    // ── Batch all-time queries (parallel) ─────────────────────────────────────
    const [
      firstScans,
      firstSchedules,
      criticalEscalations,
      silenceEvents,
    ] = await Promise.all([
      // First ever completed scan per org
      db.perceptionScan.findMany({
        where: {
          organizationId: { in: orgIds },
          status:         { in: ['COMPLETE', 'PARTIAL'] },
        },
        select: {
          id: true, organizationId: true, completedAt: true, createdAt: true,
          scanReport: {
            select: {
              accuracyScore: true, coverageScore: true,
              entityUnderstandingScore: true, consistencyScore: true,
            },
          },
        },
        orderBy: { completedAt: 'asc' },
        take: orgIds.length * 3 + 20,  // first few per org is enough
      }),

      // First ever active scan schedule per org
      db.scanSchedule.findMany({
        where:   { organizationId: { in: orgIds }, isActive: true },
        select:  { id: true, organizationId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // ORGANIZATIONAL_CONTINUITY_RISK events (CRITICAL_DEGRADATION_ONSET)
      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          eventType:      'ORGANIZATIONAL_CONTINUITY_RISK',
        },
        select: { id: true, organizationId: true, traceId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // OPERATIONAL_SILENCE_DETECTED events (for OPERATIONAL_SILENCE_RECOVERED detection)
      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          eventType:      'OPERATIONAL_SILENCE_DETECTED',
        },
        select: { id: true, organizationId: true, traceId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // ── Build lookup maps ──────────────────────────────────────────────────────
    const firstScanByOrg     = firstByOrg(firstScans,          (s) => s.organizationId);
    const firstScheduleByOrg = firstByOrg(firstSchedules,       (s) => s.organizationId);
    const escalationsByOrg   = groupByOrg(criticalEscalations.filter(
      (e): e is typeof criticalEscalations[0] & { organizationId: string } => e.organizationId !== null,
    ), (e) => e.organizationId);
    const silenceByOrg       = groupByOrg(silenceEvents.filter(
      (e): e is typeof silenceEvents[0] & { organizationId: string } => e.organizationId !== null,
    ), (e) => e.organizationId);

    const timelineMap = new Map(timelines.map((t) => [t.organizationId, t]));

    // ── Compute milestones per org ─────────────────────────────────────────────
    const results = new Map<string, OperationalMilestone[]>();

    for (const orgId of orgIds) {
      const timeline   = timelineMap.get(orgId);
      const milestones: OperationalMilestone[] = [];

      // ── FIRST_SUCCESSFUL_SCAN ──────────────────────────────────────────────
      const firstScan = firstScanByOrg.get(orgId);
      if (firstScan) {
        const achievedAt = (firstScan.completedAt ?? firstScan.createdAt).toISOString();
        milestones.push({
          milestoneType:   OPERATIONAL_MILESTONES.FIRST_SUCCESSFUL_SCAN,
          achievedAt,
          significance:    'LOW',
          persistenceScore: computePersistence(achievedAt, timeline, 30),
          derivedFrom:     ['perception_scans'],
          explanation:     'First perception scan completed successfully.',
          traceReferences: [],
          relatedEventIds: [],
          sourceEntityIds: [firstScan.id],
        });
      }

      // ── FIRST_SCHEDULE_ACTIVATION ──────────────────────────────────────────
      const firstSched = firstScheduleByOrg.get(orgId);
      if (firstSched) {
        milestones.push({
          milestoneType:   OPERATIONAL_MILESTONES.FIRST_SCHEDULE_ACTIVATION,
          achievedAt:      firstSched.createdAt.toISOString(),
          significance:    'LOW',
          persistenceScore: 80, // schedules tend to persist unless deactivated
          derivedFrom:     ['scan_schedules'],
          explanation:     'First active scan schedule configured.',
          traceReferences: [],
          relatedEventIds: [],
          sourceEntityIds: [firstSched.id],
        });
      }

      if (timeline) {
        const scanEvents    = timeline.events.filter((e) => e.category === 'SCAN');
        const transitions   = timeline.continuityTransitions;

        // ── CONTINUITY_COLLAPSE ──────────────────────────────────────────────
        for (const t of transitions) {
          if ((t.from === 'HEALTHY' || t.from === 'WATCHING') &&
              (t.to === 'FRAGMENTED' || t.to === 'STALLED')) {
            milestones.push({
              milestoneType:   OPERATIONAL_MILESTONES.CONTINUITY_COLLAPSE,
              achievedAt:      t.changedAt,
              significance:    'CRITICAL',
              persistenceScore: 0, // a collapse has no persistence benefit
              derivedFrom:     ['perception_scans'],
              explanation:     `Continuity declined from ${t.from} to ${t.to} (scan score: ${t.scoreBefore} → ${t.scoreAfter}).`,
              traceReferences: [],
              relatedEventIds: [t.scanId],
              sourceEntityIds: [t.scanId],
            });
            break; // record first collapse only
          }
        }

        // ── VISIBILITY_RECOVERED ──────────────────────────────────────────────
        // First scan score increase after a declining sequence
        const scansWithScores = timeline.events
          .filter((e) => e.category === 'SCAN' && e.description.includes('mean score'))
          .map((e) => {
            const match = e.description.match(/mean score ([\d.]+)/);
            return match ? { ts: e.timestamp, score: parseFloat(match[1]), id: e.sourceId } : null;
          })
          .filter((s): s is { ts: string; score: number; id: string } => s !== null);

        let lastDeclining = false;
        for (let i = 1; i < scansWithScores.length; i++) {
          const prev = scansWithScores[i - 1];
          const curr = scansWithScores[i];
          if (lastDeclining && curr.score > prev.score + 3) {
            const achievedAt = curr.ts;
            milestones.push({
              milestoneType:   OPERATIONAL_MILESTONES.VISIBILITY_RECOVERED,
              achievedAt,
              significance:    'HIGH',
              persistenceScore: computePersistence(achievedAt, timeline, 14),
              derivedFrom:     ['perception_scans'],
              explanation:     `Scan score recovered from ${prev.score} to ${curr.score} following a decline.`,
              traceReferences: [],
              relatedEventIds: [prev.id, curr.id],
              sourceEntityIds: [prev.id, curr.id],
            });
            lastDeclining = false;
            break;
          }
          lastDeclining = curr.score < prev.score;
        }

        // ── DRIFT_RECOVERED ───────────────────────────────────────────────────
        for (const t of transitions) {
          if ((t.from === 'STALLED' || t.from === 'FRAGMENTED') &&
              (t.to === 'WATCHING'  || t.to === 'HEALTHY')) {
            const achievedAt = t.changedAt;
            milestones.push({
              milestoneType:   OPERATIONAL_MILESTONES.DRIFT_RECOVERED,
              achievedAt,
              significance:    'HIGH',
              persistenceScore: computePersistence(achievedAt, timeline, 30),
              derivedFrom:     ['perception_scans'],
              explanation:     `Continuity recovered from ${t.from} to ${t.to} (score: ${t.scoreBefore} → ${t.scoreAfter}).`,
              traceReferences: [],
              relatedEventIds: [t.scanId],
              sourceEntityIds: [t.scanId],
            });
            break;
          }
        }

        // ── CONTINUITY_STABILIZED ─────────────────────────────────────────────
        // First 14-day period with ≥1 scan and 0 CRITICAL events
        const criticalEvents = timeline.events.filter((e) => e.severity === 'CRITICAL');
        if (scanEvents.length >= 1 && criticalEvents.length === 0) {
          // Entire window was stable
          const achievedAt = scanEvents[0].timestamp;
          milestones.push({
            milestoneType:   OPERATIONAL_MILESTONES.CONTINUITY_STABILIZED,
            achievedAt,
            significance:    'HIGH',
            persistenceScore: computePersistence(achievedAt, timeline, 14),
            derivedFrom:     ['perception_scans', 'operational_events'],
            explanation:     'No critical events detected alongside scan completions — continuity stable.',
            traceReferences: [],
            relatedEventIds: [],
            sourceEntityIds: scanEvents.slice(0, 3).map((e) => e.sourceId),
          });
        }

        // ── FIRST_STABLE_30D_PERIOD ───────────────────────────────────────────
        // 30d window with ≥2 scans, 0 CRITICAL events, and flat/improving scores
        if (scanEvents.length >= 2 && criticalEvents.length === 0 && timeline.windowDays >= 30) {
          milestones.push({
            milestoneType:   OPERATIONAL_MILESTONES.FIRST_STABLE_30D_PERIOD,
            achievedAt:      timeline.generatedFromWindow.start,
            significance:    'MEDIUM',
            persistenceScore: 70,
            derivedFrom:     ['perception_scans'],
            explanation:     `${scanEvents.length} scans completed without critical failures in a 30-day window.`,
            traceReferences: [],
            relatedEventIds: [],
            sourceEntityIds: scanEvents.slice(0, 3).map((e) => e.sourceId),
          });
        }

        // ── FIRST_POSITIVE_IMPACT ─────────────────────────────────────────────
        // Derived from a RECOMMENDATION event followed by a SCAN event with higher score
        const recEvents = timeline.events.filter(
          (e) => e.category === 'RECOMMENDATION' && e.description.includes('completed'),
        );
        for (const rec of recEvents) {
          const scansAfter = scansWithScores.filter((s) => s.ts > rec.timestamp);
          const scansBefore = scansWithScores.filter((s) => s.ts <= rec.timestamp);
          if (scansAfter.length > 0 && scansBefore.length > 0) {
            const scoreBefore = scansBefore[scansBefore.length - 1].score;
            const scoreAfter  = scansAfter[0].score;
            if (scoreAfter > scoreBefore + 3) {
              milestones.push({
                milestoneType:   OPERATIONAL_MILESTONES.FIRST_POSITIVE_IMPACT,
                achievedAt:      scansAfter[0].ts,
                significance:    'MEDIUM',
                persistenceScore: computePersistence(scansAfter[0].ts, timeline, 14),
                derivedFrom:     ['recommendations', 'perception_scans'],
                explanation:     `Recommendation completion correlated with scan score improvement from ${scoreBefore} to ${scoreAfter}.`,
                traceReferences: [],
                relatedEventIds: [rec.sourceId, scansAfter[0].id],
                sourceEntityIds: [rec.sourceId, scansAfter[0].id],
              });
              break;
            }
          }
        }
      }

      // ── CRITICAL_DEGRADATION_ONSET ────────────────────────────────────────
      const escalations = escalationsByOrg.get(orgId) ?? [];
      if (escalations.length > 0) {
        const first = escalations[0];
        milestones.push({
          milestoneType:   OPERATIONAL_MILESTONES.CRITICAL_DEGRADATION_ONSET,
          achievedAt:      first.createdAt.toISOString(),
          significance:    'CRITICAL',
          persistenceScore: 0,
          derivedFrom:     ['operational_events'],
          explanation:     'ORGANIZATIONAL_CONTINUITY_RISK event — sustained degradation detected.',
          traceReferences: first.traceId ? [first.traceId] : [],
          relatedEventIds: [first.id],
          sourceEntityIds: [first.id],
        });
      }

      // ── OPERATIONAL_SILENCE_RECOVERED ────────────────────────────────────
      const silences = silenceByOrg.get(orgId) ?? [];
      if (silences.length > 0 && timeline) {
        const lastSilence = silences[silences.length - 1];
        const scanAfterSilence = timeline.events.find(
          (e) => e.category === 'SCAN' && e.timestamp > lastSilence.createdAt.toISOString(),
        );
        if (scanAfterSilence) {
          milestones.push({
            milestoneType:   OPERATIONAL_MILESTONES.OPERATIONAL_SILENCE_RECOVERED,
            achievedAt:      scanAfterSilence.timestamp,
            significance:    'MEDIUM',
            persistenceScore: computePersistence(scanAfterSilence.timestamp, timeline, 14),
            derivedFrom:     ['operational_events', 'perception_scans'],
            explanation:     'Scan activity resumed following an operational silence period.',
            traceReferences: lastSilence.traceId ? [lastSilence.traceId] : [],
            relatedEventIds: [lastSilence.id, scanAfterSilence.sourceId],
            sourceEntityIds: [lastSilence.id, scanAfterSilence.sourceId],
          });
        }
      }

      // Sort by achievedAt
      milestones.sort((a, b) => a.achievedAt.localeCompare(b.achievedAt));
      results.set(orgId, milestones);
    }

    return results;
  }
}

// ── persistenceScore computation (Refinement 3) ───────────────────────────────
// How many days of continued good operational signal followed the milestone?
// Capped at `lookAheadDays`. 100 = sustained through end of window.

function computePersistence(
  achievedAt: string,
  timeline:   OrganizationalTimeline | undefined,
  lookAheadDays: number,
): number {
  if (!timeline) return 50;

  const achievedMs = new Date(achievedAt).getTime();
  const lookAhead  = lookAheadDays * 24 * 60 * 60 * 1000;
  const windowEnd  = new Date(timeline.generatedFromWindow.end).getTime();

  // Check for CRITICAL/ERROR events after milestone
  const negativeAfter = timeline.events.filter(
    (e) => new Date(e.timestamp).getTime() > achievedMs &&
           (e.severity === 'CRITICAL' || e.severity === 'ERROR'),
  );

  if (negativeAfter.length === 0) return 100; // sustained through window

  const firstNegative = new Date(negativeAfter[0].timestamp).getTime();
  const sustainedMs   = Math.min(firstNegative - achievedMs, lookAhead);
  const score         = Math.round((sustainedMs / lookAhead) * 100);
  return Math.max(0, Math.min(100, score));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstByOrg<T>(arr: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of arr) {
    const k = key(item);
    if (!map.has(k)) map.set(k, item);
  }
  return map;
}

function groupByOrg<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const existing = map.get(k) ?? [];
    existing.push(item);
    map.set(k, existing);
  }
  return map;
}
