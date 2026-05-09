/**
 * @fileOverview GET /api/admin/forecasting — Predictive Continuity Forecasting data.
 *
 * Admin-only. Orchestrates Sprint 7 services (for historical substrate) and
 * Sprint 8 services (for deterministic forecasts) across all real organizations.
 *
 * Sprint 8 Panels:
 *   1. Continuity Forecasts        (ContinuityForecastService — Task 1)
 *   2. Continuity Trajectories     (ContinuityTrajectoryService — Task 2)
 *   3. Organizational Resilience   (OperationalResilienceService — Task 3)
 *   4. Intervention Timing         (InterventionTimingService — Task 4)
 *   5. Operational Risk Forecasts  (OperationalRiskForecastService — Task 5)
 *   6. Predictive Narratives       (PredictiveNarrativeService — Task 6)
 *
 * Execution order:
 *   buildTimelines + computeReplay (parallel DB — Sprint 7)
 *   → reconstructMemory + detectMilestones (parallel — Sprint 7)
 *   → computeLineage (pure — Sprint 7)
 *   → computeForecasts + computeTrajectories + computeResiliences + computeTimings (parallel pure — Sprint 8)
 *   → computeRisks (pure — Sprint 8, needs Step 4 outputs)
 *   → generateNarratives (pure — Sprint 8, needs all)
 *
 * Query params:
 *   window: 30 | 90 | 365   (default: 90)
 *   orgId:  <string>         (optional — single org detail mode)
 *
 * Refinement F: GET-only — no state mutations, no auto-triggers.
 * Refinement 10: runtime-health forecasting fields added to /api/runtime-health.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin }              from '@/lib/auth/get-auth-context';
import { db }                        from '@/lib/db';

// Sprint 7 services (historical substrate)
import { OrganizationalTimelineService } from '@/lib/services/organizational-timeline-service';
import { OperationalMemoryService }      from '@/lib/services/operational-memory-service';
import { OperationalMilestoneService }   from '@/lib/services/operational-milestone-service';
import { InterventionLineageService }    from '@/lib/services/intervention-lineage-service';
import { ContinuityReplayService }       from '@/lib/services/continuity-replay-service';

// Sprint 8 services (forecasting)
import { ContinuityForecastService }     from '@/lib/services/continuity-forecast-service';
import { ContinuityTrajectoryService }   from '@/lib/services/continuity-trajectory-service';
import { OperationalResilienceService }  from '@/lib/services/operational-resilience-service';
import { InterventionTimingService }     from '@/lib/services/intervention-timing-service';
import { OperationalRiskForecastService }from '@/lib/services/operational-risk-forecast-service';
import { PredictiveNarrativeService }    from '@/lib/services/predictive-narrative-service';

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

    // ── 1. Load real organizations ─────────────────────────────────────────────
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
        forecasts: [], trajectories: [], resiliences: [],
        timings: [], risks: [], narratives: [],
      });
    }

    const orgNameMap = new Map(orgs.map((o) => [o.id, o.name]));
    const orgMetaMap = new Map(orgs.map((o) => [o.id, { name: o.name, slug: o.slug, tier: o.tier }]));

    // ── 2. Parallel: timelines (DB) + replay (DB) — Sprint 7 ──────────────────
    const [timelines, replays] = await Promise.all([
      OrganizationalTimelineService.buildForOrgs(orgIds, orgs, windowDays),
      ContinuityReplayService.computeForOrgs(orgIds, windowDays),
    ]);

    // ── 3. Parallel: memory (pure) + milestones (light DB) — Sprint 7 ─────────
    const [memories, milestoneMap] = await Promise.all([
      Promise.resolve(OperationalMemoryService.reconstructForOrgs(timelines)),
      OperationalMilestoneService.detectForOrgs(orgIds, timelines),
    ]);

    // Merge milestones back into timelines
    for (const tl of timelines) {
      tl.milestones = milestoneMap.get(tl.organizationId) ?? [];
    }

    // ── 4. Intervention lineage — Sprint 7 ────────────────────────────────────
    const timelineMap = new Map(timelines.map((t) => [t.organizationId, t]));
    const memoryMap   = new Map(memories.map((m) => [m.organizationId, m]));
    const lineages    = InterventionLineageService.computeForOrgs(
      orgIds, timelineMap, memoryMap, milestoneMap,
    );
    const lineageMap  = new Map(lineages.map((l) => [l.organizationId, l]));
    const replayMap   = new Map(replays.map((r) => [r.organizationId, r]));

    // ── 5. Parallel Sprint 8 pure services ────────────────────────────────────
    const [forecasts, trajectories, resiliences, timings] = await Promise.all([
      Promise.resolve(
        ContinuityForecastService.computeForOrgs(orgIds, replayMap, timelineMap),
      ),
      Promise.resolve(
        ContinuityTrajectoryService.computeForOrgs(orgIds, replayMap),
      ),
      Promise.resolve(
        OperationalResilienceService.computeForOrgs(orgIds, replayMap, memoryMap, lineageMap),
      ),
      Promise.resolve(
        InterventionTimingService.computeForOrgs(orgIds, lineageMap, replayMap),
      ),
    ]);

    const forecastMap    = new Map(forecasts.map((f) => [f.organizationId, f]));
    const trajectoryMap  = new Map(trajectories.map((t) => [t.organizationId, t]));
    const resilienceMap  = new Map(resiliences.map((r) => [r.organizationId, r]));
    const timingMap      = new Map(timings.map((t) => [t.organizationId, t]));

    // ── 6. Risk forecasts (needs Step 5 outputs) ───────────────────────────────
    const risks = OperationalRiskForecastService.computeForOrgs(
      orgIds, forecastMap, trajectoryMap, resilienceMap, timelineMap, memoryMap,
    );
    const riskMap = new Map(risks.map((r) => [r.organizationId, r]));

    // ── 7. Predictive narratives (needs all Sprint 8 outputs) ─────────────────
    const narratives = PredictiveNarrativeService.generateForOrgs(
      orgIds, forecastMap, trajectoryMap, resilienceMap, timingMap, riskMap, orgNameMap,
    );

    // ── 8. Summary aggregations ───────────────────────────────────────────────
    const byCurrentState:    Record<string, number> = {};
    const byResilienceState: Record<string, number> = {};
    const byRiskLevel:       Record<string, number> = {};
    const byTrajectory:      Record<string, number> = {};

    for (const f of forecasts) {
      byCurrentState[f.currentState] = (byCurrentState[f.currentState] ?? 0) + 1;
    }
    for (const r of resiliences) {
      byResilienceState[r.resilienceState] = (byResilienceState[r.resilienceState] ?? 0) + 1;
    }
    for (const r of risks) {
      byRiskLevel[r.riskLevel] = (byRiskLevel[r.riskLevel] ?? 0) + 1;
    }
    for (const t of trajectories) {
      byTrajectory[t.trajectoryType] = (byTrajectory[t.trajectoryType] ?? 0) + 1;
    }

    const totalHighRisk = (byRiskLevel['HIGH'] ?? 0) + (byRiskLevel['CRITICAL'] ?? 0);
    const totalImmediate = timings.filter(
      (t) => t.recommendedInterventionWindow === 'IMMEDIATE',
    ).length;

    // ── 9. Attach org metadata ────────────────────────────────────────────────
    function withOrg<T extends { organizationId: string }>(arr: T[]) {
      return arr.map((item) => ({ ...item, org: orgMetaMap.get(item.organizationId) ?? null }));
    }

    return NextResponse.json({
      traceId,
      windowDays,
      generatedAt: new Date().toISOString(),
      summary: {
        totalOrgs: orgIds.length,
        byCurrentState,
        byResilienceState,
        byRiskLevel,
        byTrajectory,
        totalHighRisk,
        totalImmediate,
        totalProjectedRisks: risks.reduce((s, r) => s + r.projectedRisks.length, 0),
      },
      forecasts:    withOrg(forecasts),
      trajectories: withOrg(trajectories),
      resiliences:  withOrg(resiliences),
      timings:      withOrg(timings),
      risks:        withOrg(risks),
      narratives:   withOrg(narratives),
    });

  } catch (err: any) {
    console.error('[admin/forecasting] GET failed', { traceId, error: err?.message });
    return NextResponse.json({ error: 'Failed to load forecasting data' }, { status: 500 });
  }
}
