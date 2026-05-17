/**
 * @fileOverview GET /api/admin/intelligence — Cross-Organizational Intelligence data.
 *
 * Admin-only. Orchestrates the full Sprint 7→8→9 service pipeline across all
 * real organizations to produce platform-level collective intelligence.
 *
 * Sprint 9 Panels:
 *   1. Forecast Validations          (ForecastValidationService — Task 1)
 *   2. Cross-Organizational Patterns (CrossOrganizationalPatternService — Task 2)
 *   3. Operational Archetypes        (OperationalArchetypeService — Task 3)
 *   4. Intervention Benchmarks       (InterventionBenchmarkService — Task 4)
 *   5. Resilience Benchmarks         (ResilienceBenchmarkService — Task 5)
 *   6. Collective Narrative          (CollectiveOperationalNarrativeService — Task 6)
 *
 * Execution order:
 *   loadOrgs (DB)
 *   → buildTimelines + computeReplay (parallel DB — Sprint 7)
 *   → reconstructMemory + detectMilestones (parallel — Sprint 7)
 *   → computeLineage (pure — Sprint 7)
 *   → computeForecasts + computeTrajectories + computeResiliences + computeTimings (parallel — Sprint 8)
 *   → computeRisks (pure — Sprint 8)
 *   → computeValidations + detectPatterns + classifyArchetypes + computeInterventionBenchmarks (parallel — Sprint 9)
 *   → computeResilienceBenchmarks (pure — Sprint 9, needs archetypes)
 *   → generateCollectiveNarrative (pure — Sprint 9, needs all)
 *
 * Query params:
 *   window: 30 | 90 | 365   (default: 90)
 *
 * Refinement F: GET-only — no state mutations, no auto-triggers.
 * Refinement 10: runtime-health intelligence fields added to /api/runtime-health.
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
import { ForecastValidationService }              from '@/lib/services/forecast-validation-service';
import { CrossOrganizationalPatternService }      from '@/lib/services/cross-organizational-pattern-service';
import { OperationalArchetypeService }            from '@/lib/services/operational-archetype-service';
import { InterventionBenchmarkService }           from '@/lib/services/intervention-benchmark-service';
import { ResilienceBenchmarkService }             from '@/lib/services/resilience-benchmark-service';
import { CollectiveOperationalNarrativeService }  from '@/lib/services/collective-operational-narrative-service';

// Sprint 10 services
import { IntelligenceSnapshotService } from '@/lib/services/intelligence-snapshot-service';
import { IntelligenceDiffService }     from '@/lib/services/intelligence-diff-service';

const SENTINEL_IDS = ['free-scan', 'unassigned'];

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const raw = req.nextUrl.searchParams.get('window');
    const windowDays: 30 | 90 | 365 =
      raw === '30'  ? 30  :
      raw === '365' ? 365 :
      90;

    // Compute generatedFromWindow for pure services
    const windowEnd   = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const generatedFromWindow = {
      start: windowStart.toISOString(),
      end:   windowEnd.toISOString(),
    };

    // ── 1. Load real organizations ─────────────────────────────────────────────
    const orgs = await db.organization.findMany({
      where:   { id: { notIn: SENTINEL_IDS }, isActive: true },
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
        validations: [], patterns: [], archetypes: [],
        interventionBenchmarks: [], resilienceBenchmarks: [],
        collectiveNarrative: null,
      });
    }

    const orgMetaMap = new Map(orgs.map((o) => [o.id, { name: o.name, slug: o.slug, tier: o.tier }]));
    const orgNameMap = new Map(orgs.map((o) => [o.id, o.name]));

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
      Promise.resolve(ContinuityForecastService.computeForOrgs(orgIds, replayMap, timelineMap)),
      Promise.resolve(ContinuityTrajectoryService.computeForOrgs(orgIds, replayMap)),
      Promise.resolve(OperationalResilienceService.computeForOrgs(orgIds, replayMap, memoryMap, lineageMap)),
      Promise.resolve(InterventionTimingService.computeForOrgs(orgIds, lineageMap, replayMap)),
    ]);

    const forecastMap   = new Map(forecasts.map((f) => [f.organizationId, f]));
    const trajectoryMap = new Map(trajectories.map((t) => [t.organizationId, t]));
    const resilienceMap = new Map(resiliences.map((r) => [r.organizationId, r]));
    const timingMap     = new Map(timings.map((t) => [t.organizationId, t]));

    // ── 6. Risk forecasts (Sprint 8) ──────────────────────────────────────────
    const risks   = OperationalRiskForecastService.computeForOrgs(
      orgIds, forecastMap, trajectoryMap, resilienceMap, timelineMap, memoryMap,
    );
    const riskMap = new Map(risks.map((r) => [r.organizationId, r]));

    // ── 7. Parallel Sprint 9 pure services ────────────────────────────────────
    const [validations, patterns, archetypes, interventionBenchmarks] = await Promise.all([
      Promise.resolve(
        ForecastValidationService.validateForOrgs(orgIds, replayMap, forecastMap, timelineMap),
      ),
      Promise.resolve(
        CrossOrganizationalPatternService.detectPatterns(
          trajectories, memories, risks, resiliences, timings, generatedFromWindow,
        ),
      ),
      Promise.resolve(
        OperationalArchetypeService.classifyForOrgs(
          orgIds, forecastMap, trajectoryMap, resilienceMap, timingMap, riskMap,
        ),
      ),
      Promise.resolve(
        InterventionBenchmarkService.computeBenchmarks(lineages, generatedFromWindow),
      ),
    ]);

    // ── 8. Resilience benchmarks (needs archetypes from Step 7) ───────────────
    const resilienceBenchmarks = ResilienceBenchmarkService.computeBenchmarks(
      resiliences, archetypes, generatedFromWindow,
    );

    // ── 9. Collective narrative (needs all Sprint 9 outputs) ──────────────────
    const collectiveNarrative = CollectiveOperationalNarrativeService.generate(
      validations,
      patterns,
      archetypes,
      interventionBenchmarks,
      resilienceBenchmarks,
      generatedFromWindow,
    );

    // ── 10. Summary aggregations ───────────────────────────────────────────────
    const byArchetype:      Record<string, number> = {};
    const byPatternType:    Record<string, number> = {};
    const byValidation:     Record<string, number> = {};
    const byBenchmarkState: Record<string, number> = {};

    for (const a of archetypes) {
      byArchetype[a.archetype] = (byArchetype[a.archetype] ?? 0) + 1;
    }
    for (const p of patterns) {
      byPatternType[p.patternType] = (byPatternType[p.patternType] ?? 0) + 1;
    }
    for (const v of validations) {
      byValidation[v.validationResult] = (byValidation[v.validationResult] ?? 0) + 1;
    }
    for (const b of resilienceBenchmarks) {
      byBenchmarkState[b.benchmarkState] = (byBenchmarkState[b.benchmarkState] ?? 0) + 1;
    }

    const accuracyRate = validations.length > 0
      ? Math.round(
          (validations.filter((v) => v.validationResult === 'ACCURATE').length /
            validations.length) * 100,
        )
      : 0;

    // ── 11. Sprint 10: fetch last snapshots + compute diffs ───────────────────
    const [lastSnapshots, recentAlerts] = await Promise.all([
      IntelligenceSnapshotService.getLatestSnapshots(orgIds, windowDays),
      db.notification.findMany({
        where: {
          organizationId: { in: orgIds },
          type: { in: ['CONTINUITY_STATE_DECLINED', 'ARCHETYPE_TRANSITION', 'INTERVENTION_REQUIRED', 'RISK_ESCALATED'] as any[] },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        select: { organizationId: true, type: true, severity: true, title: true, message: true, createdAt: true, isRead: true },
        take: 50,
      }),
    ]);

    const archetypeMap = new Map(archetypes.map((a) => [a.organizationId, a]));
    const diffs = IntelligenceDiffService.diffForOrgs(
      orgIds, forecastMap, archetypeMap, riskMap, timingMap, resilienceMap, lastSnapshots,
    );

    const orgsWithChanges = [...diffs.values()].filter((d) => d.hasDiff).length;

    // ── 12. Attach org metadata to org-level results ──────────────────────────
    function withOrg<T extends { organizationId: string }>(arr: T[]) {
      return arr.map((item) => ({
        ...item,
        org:  orgMetaMap.get(item.organizationId) ?? null,
        diff: diffs.get(item.organizationId) ?? null,
      }));
    }

    return NextResponse.json({
      traceId,
      windowDays,
      generatedAt:       new Date().toISOString(),
      generatedFromWindow,
      summary: {
        totalOrgs:              orgIds.length,
        validationsComplete:    validations.length,
        patternsDetected:       patterns.length,
        archetypesClassified:   archetypes.length,
        interventionTypes:      interventionBenchmarks.length,
        resilienceGroups:       resilienceBenchmarks.length,
        forecastAccuracyPct:    accuracyRate,
        orgsWithChanges,
        overallPlatformState:   collectiveNarrative.overallPlatformState,
        forecastDriftTrend:     collectiveNarrative.forecastDriftTrend,
        platformIntelligenceDensity: collectiveNarrative.platformIntelligenceDensity,
        byArchetype,
        byPatternType,
        byValidation,
        byBenchmarkState,
      },
      collectiveNarrative,
      validations:             withOrg(validations),
      patterns,
      archetypes:              withOrg(archetypes),
      interventionBenchmarks,
      resilienceBenchmarks,
      recentAlerts,
    });

  } catch (err: any) {
    console.error('[admin/intelligence] GET failed', { traceId, error: err?.message });
    return NextResponse.json({ error: 'Failed to load intelligence data' }, { status: 500 });
  }
}
