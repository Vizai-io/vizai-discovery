/**
 * @fileOverview POST /api/cron/intelligence-snapshot
 *
 * Cron-triggered endpoint that runs the full Sprint 7→8→9 intelligence
 * pipeline and persists one OrgIntelligenceSnapshot row per org.
 *
 * Security:
 *   Requires `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Execution model:
 *   1. Load all real orgs (sentinel-excluded)
 *   2. Run Sprint 7 DB services (timelines, replay)
 *   3. Run Sprint 7 pure services (memory, milestones, lineage)
 *   4. Run Sprint 8 pure services (forecasts, trajectories, resiliences, timings)
 *   5. Run Sprint 8 risk forecasts
 *   6. Run Sprint 9 pure services (validations, archetypes)
 *   7. Persist snapshots via IntelligenceSnapshotService
 *   8. Compute diffs and evaluate alert thresholds (Sprint 12)
 *   9. Write intelligence alerts via IntelligenceAlertingService (Sprint 12)
 *  10. Log completion to OperationalEvent
 *
 * Example cron config (vercel.json):
 * {
 *   "crons": [{ "path": "/api/cron/intelligence-snapshot", "schedule": "0 2 * * *" }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/db';

// Sprint 7 services
import { OrganizationalTimelineService } from '@/lib/services/organizational-timeline-service';
import { OperationalMemoryService }      from '@/lib/services/operational-memory-service';
import { OperationalMilestoneService }   from '@/lib/services/operational-milestone-service';
import { InterventionLineageService }    from '@/lib/services/intervention-lineage-service';
import { ContinuityReplayService }       from '@/lib/services/continuity-replay-service';

// Sprint 8 services
import { ContinuityForecastService }      from '@/lib/services/continuity-forecast-service';
import { ContinuityTrajectoryService }    from '@/lib/services/continuity-trajectory-service';
import { OperationalResilienceService }   from '@/lib/services/operational-resilience-service';
import { InterventionTimingService }      from '@/lib/services/intervention-timing-service';
import { OperationalRiskForecastService } from '@/lib/services/operational-risk-forecast-service';

// Sprint 9 services
import { ForecastValidationService }     from '@/lib/services/forecast-validation-service';
import { OperationalArchetypeService }   from '@/lib/services/operational-archetype-service';

// Sprint 10 services
import { IntelligenceSnapshotService }   from '@/lib/services/intelligence-snapshot-service';
import { IntelligenceDiffService }       from '@/lib/services/intelligence-diff-service';

// Sprint 12 services
import { AlertThresholdService }         from '@/lib/services/alert-threshold-service';
import { IntelligenceAlertingService }   from '@/lib/services/intelligence-alerting-service';

import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES } from '@/lib/services/operational-event-service';

export const maxDuration = 300;

const SENTINEL_IDS  = ['free-scan', 'unassigned'];
const WINDOW_DAYS: 30 | 90 | 365 = 90;

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  // ── Auth: CRON_SECRET ────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    // ── 1. Load real organizations ─────────────────────────────────────────────
    const orgs = await db.organization.findMany({
      where:   { id: { notIn: SENTINEL_IDS }, isActive: true },
      select:  { id: true, name: true, slug: true, tier: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const orgIds = orgs.map((o) => o.id);

    if (orgIds.length === 0) {
      return NextResponse.json({
        traceId, success: true, orgsProcessed: 0,
        message: 'No active organizations to snapshot.',
      });
    }

    // Compute generatedFromWindow
    const windowEnd   = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const generatedFromWindow = { start: windowStart.toISOString(), end: windowEnd.toISOString() };

    // ── 2. Sprint 7 DB services ────────────────────────────────────────────────
    const [timelines, replays] = await Promise.all([
      OrganizationalTimelineService.buildForOrgs(orgIds, orgs, WINDOW_DAYS),
      ContinuityReplayService.computeForOrgs(orgIds, WINDOW_DAYS),
    ]);

    // ── 3. Sprint 7 pure services ──────────────────────────────────────────────
    const [memories, milestoneMap] = await Promise.all([
      Promise.resolve(OperationalMemoryService.reconstructForOrgs(timelines)),
      OperationalMilestoneService.detectForOrgs(orgIds, timelines),
    ]);

    for (const tl of timelines) {
      tl.milestones = milestoneMap.get(tl.organizationId) ?? [];
    }

    const timelineMap = new Map(timelines.map((t) => [t.organizationId, t]));
    const memoryMap   = new Map(memories.map((m) => [m.organizationId, m]));
    const lineages    = InterventionLineageService.computeForOrgs(
      orgIds, timelineMap, memoryMap, milestoneMap,
    );
    const lineageMap  = new Map(lineages.map((l) => [l.organizationId, l]));
    const replayMap   = new Map(replays.map((r) => [r.organizationId, r]));

    // ── 4. Sprint 8 pure services ──────────────────────────────────────────────
    const [forecasts, trajectories, resiliences, timings] = await Promise.all([
      Promise.resolve(ContinuityForecastService.computeForOrgs(orgIds, replayMap, timelineMap)),
      Promise.resolve(ContinuityTrajectoryService.computeForOrgs(orgIds, replayMap)),
      Promise.resolve(OperationalResilienceService.computeForOrgs(orgIds, replayMap, memoryMap, lineageMap)),
      Promise.resolve(InterventionTimingService.computeForOrgs(orgIds, lineageMap, replayMap)),
    ]);

    const forecastMap   = new Map(forecasts.map((f) => [f.organizationId, f]));
    const trajectoryMap = new Map(trajectories.map((t) => [t.organizationId, t]));
    const resilienceMap = new Map(resiliences.map((r) => [r.organizationId, r]));
    const timingMap     = new Map(timings.map((t) => [t.organizationId, t]));

    // ── 5. Sprint 8 risk forecasts ─────────────────────────────────────────────
    const risks   = OperationalRiskForecastService.computeForOrgs(
      orgIds, forecastMap, trajectoryMap, resilienceMap, timelineMap, memoryMap,
    );
    const riskMap = new Map(risks.map((r) => [r.organizationId, r]));

    // ── 6. Sprint 9 services (validation + archetypes) ────────────────────────
    const [validations, archetypes] = await Promise.all([
      Promise.resolve(ForecastValidationService.validateForOrgs(orgIds, replayMap, forecastMap, timelineMap)),
      Promise.resolve(OperationalArchetypeService.classifyForOrgs(
        orgIds, forecastMap, trajectoryMap, resilienceMap, timingMap, riskMap,
      )),
    ]);
    const validationMap = new Map(validations.map((v) => [v.organizationId, v]));
    const archetypeMap  = new Map(archetypes.map((a) => [a.organizationId, a]));

    // ── 7. Fetch last snapshots for diff ───────────────────────────────────────
    const lastSnapshots = await IntelligenceSnapshotService.getLatestSnapshots(orgIds, WINDOW_DAYS);

    // ── 8. Persist new snapshots ───────────────────────────────────────────────
    const { persisted, skipped } = await IntelligenceSnapshotService.persistSnapshots(
      orgIds, WINDOW_DAYS,
      forecastMap, trajectoryMap, resilienceMap, timingMap,
      riskMap, archetypeMap, validationMap,
    );

    // ── 9. Compute diffs and fire alerts (Sprint 12) ───────────────────────────
    const diffs = IntelligenceDiffService.diffForOrgs(
      orgIds, forecastMap, archetypeMap, riskMap, timingMap, resilienceMap, lastSnapshots,
    );

    const alertResult = await IntelligenceAlertingService.processAlerts(
      [...diffs.values()],
      riskMap,
      timingMap,
    );

    // ── 10. Log completion ─────────────────────────────────────────────────────
    const durationMs = Date.now() - startedAt;
    await OperationalEventService.emit({
      eventType:     EVENT_TYPES.INTELLIGENCE_SNAPSHOT_COMPLETED,
      severity:      'INFO',
      source:        EVENT_SOURCES.CRON_INTELLIGENCE_SNAPSHOT,
      traceId,
      message:       `Intelligence snapshot completed: ${persisted} orgs persisted, ${alertResult.fired} alerts fired in ${durationMs}ms.`,
      metadata:      { persisted, skipped, alertsFired: alertResult.fired, alertsDeduplicated: alertResult.deduplicated, durationMs },
    });

    return NextResponse.json({
      traceId,
      success:      true,
      windowDays:   WINDOW_DAYS,
      orgsProcessed: orgIds.length,
      persisted,
      skipped,
      alertsFired:  alertResult.fired,
      alertsDeduplicated: alertResult.deduplicated,
      durationMs,
    });

  } catch (err: any) {
    console.error('[cron/intelligence-snapshot] failed', { traceId, error: err?.message });
    return NextResponse.json({ error: 'Intelligence snapshot failed', traceId }, { status: 500 });
  }
}
