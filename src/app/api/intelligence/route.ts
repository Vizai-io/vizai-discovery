/**
 * @fileOverview GET /api/intelligence — Customer-scoped operational intelligence.
 *
 * Auth-gated to the authenticated user's organization. Returns a
 * CustomerIntelligenceSummary for that org only — no cross-org data.
 *
 * Runs the Sprint 7→8→9 pipeline for the single requesting org.
 * Attaches the most recent snapshot diff if Sprint 10 data exists.
 *
 * Query params:
 *   window: 30 | 90 | 365   (default: 90)
 *
 * Advisory only — GET-only, no state mutations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext }            from '@/lib/auth/get-auth-context';
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
import { OperationalArchetypeService }   from '@/lib/services/operational-archetype-service';

// Sprint 10 services
import { IntelligenceSnapshotService }   from '@/lib/services/intelligence-snapshot-service';
import { IntelligenceDiffService }       from '@/lib/services/intelligence-diff-service';

// Sprint 11 service
import { CustomerIntelligenceService }   from '@/lib/services/customer-intelligence-service';

const SENTINEL_IDS = ['free-scan', 'unassigned'];

export async function GET(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = auth.organizationId;
  if (SENTINEL_IDS.includes(orgId)) {
    return NextResponse.json({ error: 'Not available for this account' }, { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get('window');
  const windowDays: 30 | 90 | 365 =
    raw === '30'  ? 30  :
    raw === '365' ? 365 :
    90;

  try {
    // Load org record
    const org = await db.organization.findUnique({
      where:  { id: orgId },
      select: { id: true, name: true, slug: true, tier: true, createdAt: true },
    });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const orgIds = [orgId];
    const orgs   = [org];

    // ── Sprint 7 DB services ───────────────────────────────────────────────────
    const [timelines, replays] = await Promise.all([
      OrganizationalTimelineService.buildForOrgs(orgIds, orgs, windowDays),
      ContinuityReplayService.computeForOrgs(orgIds, windowDays),
    ]);

    const [memories, milestoneMap] = await Promise.all([
      Promise.resolve(OperationalMemoryService.reconstructForOrgs(timelines)),
      OperationalMilestoneService.detectForOrgs(orgIds, timelines),
    ]);

    for (const tl of timelines) {
      tl.milestones = milestoneMap.get(tl.organizationId) ?? [];
    }

    const timelineMap = new Map(timelines.map((t) => [t.organizationId, t]));
    const memoryMap   = new Map(memories.map((m) => [m.organizationId, m]));
    const lineages    = InterventionLineageService.computeForOrgs(orgIds, timelineMap, memoryMap, milestoneMap);
    const lineageMap  = new Map(lineages.map((l) => [l.organizationId, l]));
    const replayMap   = new Map(replays.map((r) => [r.organizationId, r]));

    // ── Sprint 8 pure services ─────────────────────────────────────────────────
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

    // ── Sprint 9 archetype ─────────────────────────────────────────────────────
    const archetypes   = OperationalArchetypeService.classifyForOrgs(
      orgIds, forecastMap, trajectoryMap, resilienceMap, timingMap, riskMap,
    );
    const archetypeMap = new Map(archetypes.map((a) => [a.organizationId, a]));

    // ── Sprint 10 diff ─────────────────────────────────────────────────────────
    const lastSnapshots = await IntelligenceSnapshotService.getLatestSnapshots(orgIds, windowDays);
    const diffs = IntelligenceDiffService.diffForOrgs(
      orgIds, forecastMap, archetypeMap, riskMap, timingMap, resilienceMap, lastSnapshots,
    );

    // ── Sprint 11 customer summary ─────────────────────────────────────────────
    const f  = forecastMap.get(orgId);
    const t  = trajectoryMap.get(orgId);
    const r  = resilienceMap.get(orgId);
    const ti = timingMap.get(orgId);
    const ri = riskMap.get(orgId);
    const a  = archetypeMap.get(orgId);

    if (!f || !t || !r || !ti || !ri || !a) {
      return NextResponse.json({
        data: null,
        message: 'Insufficient operational data to generate intelligence summary.',
      });
    }

    const summary = CustomerIntelligenceService.generateForOrg(
      f, t, r, ti, ri, a, diffs.get(orgId) ?? null, windowDays,
    );

    return NextResponse.json({
      data:        summary,
      generatedAt: new Date().toISOString(),
      windowDays,
    });

  } catch (err: any) {
    console.error('[api/intelligence] GET failed', { orgId, error: err?.message });
    return NextResponse.json({ error: 'Failed to load intelligence data' }, { status: 500 });
  }
}
