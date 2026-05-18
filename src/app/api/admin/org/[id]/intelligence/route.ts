/**
 * @fileOverview GET /api/admin/org/[id]/intelligence — Single-org intelligence detail.
 *
 * Admin-only. Runs the full Sprint 7→8→9 pipeline for one organization and
 * returns a comprehensive intelligence picture for the per-org detail view.
 *
 * Query params:
 *   window: 30 | 90 | 365   (default: 90)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin }              from '@/lib/auth/get-auth-context';
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
import { ForecastValidationService }   from '@/lib/services/forecast-validation-service';
import { OperationalArchetypeService } from '@/lib/services/operational-archetype-service';

// Sprint 10 services
import { IntelligenceSnapshotService } from '@/lib/services/intelligence-snapshot-service';
import { IntelligenceDiffService }     from '@/lib/services/intelligence-diff-service';

const SENTINEL_IDS = ['free-scan', 'unassigned'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id: orgId } = await params;

  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (SENTINEL_IDS.includes(orgId)) {
    return NextResponse.json({ error: 'Invalid organization' }, { status: 400 });
  }

  try {
    const raw = req.nextUrl.searchParams.get('window');
    const windowDays: 30 | 90 | 365 =
      raw === '30'  ? 30  :
      raw === '365' ? 365 :
      90;

    // ── 1. Load and validate the org ──────────────────────────────────────────
    const org = await db.organization.findFirst({
      where:  { id: orgId, isActive: true, AND: [{ id: { notIn: SENTINEL_IDS } }] },
      select: { id: true, name: true, slug: true, tier: true, createdAt: true },
    });

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const orgIds = [orgId];
    const orgMetaMap = new Map([[orgId, { name: org.name, slug: org.slug, tier: org.tier }]]);

    const windowEnd   = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const generatedFromWindow = {
      start: windowStart.toISOString(),
      end:   windowEnd.toISOString(),
    };

    // ── 2. Sprint 7 DB services ───────────────────────────────────────────────
    const orgsForTimeline = [org];
    const [timelines, replays] = await Promise.all([
      OrganizationalTimelineService.buildForOrgs(orgIds, orgsForTimeline, windowDays),
      ContinuityReplayService.computeForOrgs(orgIds, windowDays),
    ]);

    // ── 3. Sprint 7 pure services ─────────────────────────────────────────────
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

    // ── 4. Sprint 8 pure services ─────────────────────────────────────────────
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

    const risks   = OperationalRiskForecastService.computeForOrgs(
      orgIds, forecastMap, trajectoryMap, resilienceMap, timelineMap, memoryMap,
    );
    const riskMap = new Map(risks.map((r) => [r.organizationId, r]));

    // ── 5. Sprint 9 per-org services ─────────────────────────────────────────
    const [validations, archetypes] = await Promise.all([
      Promise.resolve(
        ForecastValidationService.validateForOrgs(orgIds, replayMap, forecastMap, timelineMap),
      ),
      Promise.resolve(
        OperationalArchetypeService.classifyForOrgs(
          orgIds, forecastMap, trajectoryMap, resilienceMap, timingMap, riskMap,
        ),
      ),
    ]);

    const archetypeMap = new Map(archetypes.map((a) => [a.organizationId, a]));

    // ── 6. Sprint 10: snapshot diff ───────────────────────────────────────────
    const [lastSnapshots, recentAlerts] = await Promise.all([
      IntelligenceSnapshotService.getLatestSnapshots(orgIds, windowDays),
      db.notification.findMany({
        where: {
          organizationId: orgId,
          type: { in: ['CONTINUITY_STATE_DECLINED', 'ARCHETYPE_TRANSITION', 'INTERVENTION_REQUIRED', 'RISK_ESCALATED'] as any[] },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, organizationId: true, type: true, severity: true,
          title: true, message: true, createdAt: true, isRead: true,
        },
        take: 20,
      }),
    ]);

    const diffs = IntelligenceDiffService.diffForOrgs(
      orgIds, forecastMap, archetypeMap, riskMap, timingMap, resilienceMap, lastSnapshots,
    );

    const forecast   = forecastMap.get(orgId)   ?? null;
    const trajectory = trajectoryMap.get(orgId) ?? null;
    const resilience = resilienceMap.get(orgId) ?? null;
    const timing     = timingMap.get(orgId)     ?? null;
    const risk       = riskMap.get(orgId)       ?? null;
    const archetype  = archetypeMap.get(orgId)  ?? null;
    const validation = validations.find((v) => v.organizationId === orgId) ?? null;
    const lineage    = lineageMap.get(orgId)    ?? null;
    const memory     = memoryMap.get(orgId)     ?? null;
    const timeline   = timelineMap.get(orgId)   ?? null;
    const replay     = replayMap.get(orgId)     ?? null;
    const diff       = diffs.get(orgId)         ?? null;
    const snapshot   = lastSnapshots.get(orgId) ?? null;

    return NextResponse.json({
      traceId,
      windowDays,
      generatedAt: new Date().toISOString(),
      generatedFromWindow,
      org: { id: org.id, name: org.name, slug: org.slug, tier: org.tier, createdAt: org.createdAt },
      // Sprint 8
      forecast,
      trajectory,
      resilience,
      timing,
      risk,
      // Sprint 9
      archetype,
      validation,
      // Sprint 7
      lineage,
      memory,
      timeline: timeline
        ? {
            events:               timeline.events.slice(0, 10),
            continuityTransitions: timeline.continuityTransitions.slice(0, 5),
            significantMoments:   timeline.significantMoments.slice(0, 5),
            confidence:           timeline.confidence,
          }
        : null,
      replay: replay
        ? {
            snapshotCount: replay.snapshots.length,
            recentSnapshots: replay.snapshots.slice(-5),
          }
        : null,
      // Sprint 10
      diff,
      lastSnapshotAt: snapshot?.snapshotAt?.toISOString() ?? null,
      recentAlerts,
    });

  } catch (err: any) {
    console.error('[admin/org/intelligence] GET failed', { traceId, orgId, error: err?.message });
    return NextResponse.json({ error: 'Failed to load org intelligence data' }, { status: 500 });
  }
}
