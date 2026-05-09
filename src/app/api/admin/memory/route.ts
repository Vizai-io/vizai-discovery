/**
 * @fileOverview GET /api/admin/memory — Operational Memory Dashboard data.
 *
 * Admin-only. Orchestrates Sprint 7 services for all real organizations
 * and returns structured 5-panel data for /admin/memory.
 *
 * Panels:
 *   1. Organizational Timelines    (OrganizationalTimelineService — Task 1)
 *   2. Operational Milestones      (OperationalMilestoneService — Task 3)
 *   3. Intervention Lineage        (InterventionLineageService — Task 4)
 *   4. Continuity Replay           (ContinuityReplayService — Task 5)
 *   5. Organizational Narratives   (OrganizationalNarrativeService — Task 6)
 *
 * Execution order:
 *   buildTimelines + computeReplay (parallel DB)
 *   → reconstructMemory + detectMilestones (parallel after timelines)
 *   → computeLineage (pure, needs 1+2+3)
 *   → generateNarrative (pure, needs all)
 *
 * Query params:
 *   window: 30 | 90 | 365   (default: 90)
 *   orgId:  <string>         (optional — single org detail mode)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/get-auth-context';
import { db } from '@/lib/db';

import { OrganizationalTimelineService } from '@/lib/services/organizational-timeline-service';
import { OperationalMemoryService }      from '@/lib/services/operational-memory-service';
import { OperationalMilestoneService }   from '@/lib/services/operational-milestone-service';
import { InterventionLineageService }    from '@/lib/services/intervention-lineage-service';
import { ContinuityReplayService }       from '@/lib/services/continuity-replay-service';
import { OrganizationalNarrativeService }from '@/lib/services/organizational-narrative-service';

const SENTINEL_IDS = ['free-scan', 'unassigned'];

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const raw    = req.nextUrl.searchParams.get('window');
    const orgId  = req.nextUrl.searchParams.get('orgId') ?? undefined;
    const windowDays: 30 | 90 | 365 =
      raw === '30'  ? 30  :
      raw === '365' ? 365 :
      90;

    // ── 1. Load real organizations ─────────────────────────────────────────
    const orgWhere = {
      id:       { notIn: SENTINEL_IDS, ...(orgId ? { equals: orgId } : {}) },
      isActive: true,
    };
    const orgs = await db.organization.findMany({
      where:   orgId
        ? { id: orgId, isActive: true }
        : { id: { notIn: SENTINEL_IDS }, isActive: true },
      select:  { id: true, name: true, slug: true, tier: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const orgIds = orgs.map((o) => o.id);

    if (orgIds.length === 0) {
      return NextResponse.json({
        traceId,
        windowDays,
        generatedAt: new Date().toISOString(),
        summary: { totalOrgs: 0 },
        timelines: [], milestones: {}, memories: [],
        lineages: [], replays: [], narratives: [],
      });
    }

    // ── 2. Parallel: timelines (DB) + replay (DB, independent) ────────────
    const [timelines, replays] = await Promise.all([
      OrganizationalTimelineService.buildForOrgs(orgIds, orgs, windowDays),
      ContinuityReplayService.computeForOrgs(orgIds, windowDays),
    ]);

    // ── 3. Parallel: memory (pure) + milestones (light DB) ────────────────
    const [memories, milestoneMap] = await Promise.all([
      Promise.resolve(OperationalMemoryService.reconstructForOrgs(timelines)),
      OperationalMilestoneService.detectForOrgs(orgIds, timelines),
    ]);

    // Merge milestones back into timelines
    for (const tl of timelines) {
      tl.milestones = milestoneMap.get(tl.organizationId) ?? [];
    }

    // ── 4. Intervention lineage (pure — needs 1+2+3) ──────────────────────
    const timelineMap = new Map(timelines.map((t) => [t.organizationId, t]));
    const memoryMap   = new Map(memories.map((m) => [m.organizationId, m]));
    const lineages    = InterventionLineageService.computeForOrgs(
      orgIds, timelineMap, memoryMap, milestoneMap,
    );

    // ── 5. Narratives (pure — needs all) ──────────────────────────────────
    const lineageMap  = new Map(lineages.map((l) => [l.organizationId, l]));
    const replayMap   = new Map(replays.map((r) => [r.organizationId, r]));
    const orgNameMap  = new Map(orgs.map((o) => [o.id, o.name]));
    const orgMetaMap  = new Map(orgs.map((o) => [o.id, { name: o.name, slug: o.slug, tier: o.tier }]));
    const narratives  = OrganizationalNarrativeService.generateForOrgs(
      orgIds, timelineMap, memoryMap, replayMap, lineageMap, orgNameMap,
    );

    // ── 6. Summary aggregations ───────────────────────────────────────────
    const byVolatility:  Record<string, number> = {};
    const byTrend:       Record<string, number> = {};
    const byDensity:     Record<string, number> = {};

    for (const r of replays) {
      byVolatility[r.historicalVolatility] = (byVolatility[r.historicalVolatility] ?? 0) + 1;
    }
    for (const n of narratives) {
      byTrend[n.continuityTrend]  = (byTrend[n.continuityTrend]  ?? 0) + 1;
      byDensity[n.memoryDensity]  = (byDensity[n.memoryDensity]  ?? 0) + 1;
    }

    // ── 7. Attach org metadata to response arrays ─────────────────────────
    function withOrg<T extends { organizationId: string }>(arr: T[]) {
      return arr.map((item) => ({ ...item, org: orgMetaMap.get(item.organizationId) ?? null }));
    }

    // Convert milestoneMap to flat serializable object
    const milestonesById: Record<string, any[]> = {};
    for (const [oid, ms] of milestoneMap) {
      milestonesById[oid] = ms;
    }

    return NextResponse.json({
      traceId,
      windowDays,
      generatedAt: new Date().toISOString(),
      summary: {
        totalOrgs:    orgIds.length,
        byVolatility,
        byTrend,
        byDensity,
        totalMilestones:   [...milestoneMap.values()].reduce((s, ms) => s + ms.length, 0),
        totalLineages:     lineages.reduce((s, l) => s + l.lineages.length, 0),
        totalTransitions:  replays.reduce((s, r) => s + r.transitions.length, 0),
      },
      timelines:  withOrg(timelines),
      milestones: milestonesById,
      memories:   withOrg(memories),
      lineages:   withOrg(lineages),
      replays:    withOrg(replays),
      narratives: withOrg(narratives),
    });

  } catch (err: any) {
    console.error('[admin/memory] GET failed', { traceId, error: err?.message });
    return NextResponse.json({ error: 'Failed to load memory data' }, { status: 500 });
  }
}
