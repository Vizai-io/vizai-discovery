/**
 * @fileOverview IntelligenceSnapshotService — Sprint 10 Task 2.
 *
 * Persists the computed Sprint 8/9 intelligence outputs as point-in-time
 * OrgIntelligenceSnapshot rows in Postgres.
 *
 * Called by /api/cron/intelligence-snapshot after each full pipeline run.
 * Each call appends new rows — does NOT overwrite existing snapshots.
 * Queries always use ORDER BY snapshotAt DESC LIMIT 1 to get the latest.
 *
 * Pure DB write — no computation. All intelligence is pre-computed by
 * the Sprint 7→8→9 service pipeline before this service is called.
 */

import { Prisma } from '@prisma/client';
import { db }    from '@/lib/db';
import type { ContinuityForecast }      from './continuity-forecast-service';
import type { ContinuityTrajectory }    from './continuity-trajectory-service';
import type { OperationalResilience }   from './operational-resilience-service';
import type { InterventionTimingInsight } from './intervention-timing-service';
import type { OperationalRiskForecast } from './operational-risk-forecast-service';
import type { OperationalArchetype }    from './operational-archetype-service';
import type { ForecastValidation }      from './forecast-validation-service';

// ── IntelligenceSnapshotService ───────────────────────────────────────────────

export class IntelligenceSnapshotService {
  /**
   * Persist one snapshot row per org from the current intelligence pipeline outputs.
   * Uses createMany for a single batch write.
   */
  static async persistSnapshots(
    orgIds:       string[],
    windowDays:   30 | 90 | 365,
    forecasts:    Map<string, ContinuityForecast>,
    trajectories: Map<string, ContinuityTrajectory>,
    resiliences:  Map<string, OperationalResilience>,
    timings:      Map<string, InterventionTimingInsight>,
    risks:        Map<string, OperationalRiskForecast>,
    archetypes:   Map<string, OperationalArchetype>,
    validations:  Map<string, ForecastValidation>,
  ): Promise<{ persisted: number; skipped: number }> {
    const rows: Prisma.OrgIntelligenceSnapshotCreateManyInput[] = [];

    for (const orgId of orgIds) {
      const f  = forecasts.get(orgId);
      const t  = trajectories.get(orgId);
      const r  = resiliences.get(orgId);
      const ti = timings.get(orgId);
      const ri = risks.get(orgId);
      const a  = archetypes.get(orgId);

      // All core Sprint 8/9 outputs required; validation is optional
      if (!f || !t || !r || !ti || !ri || !a) continue;

      const v = validations.get(orgId);

      rows.push({
        organizationId:      orgId,
        windowDays,
        archetype:           a.archetype,
        archetypeStability:  a.archetypeStability,
        archetypeConfidence: a.confidence,
        continuityState:     f.currentState,
        projectedState30d:   f.projectedState30d,
        projectedState90d:   f.projectedState90d,
        continuityTrend:     f.continuityTrend,
        forecastStability:   f.forecastStability,
        resilienceScore:     r.resilienceScore,
        resilienceState:     r.resilienceState,
        riskLevel:           ri.riskLevel,
        trajectoryType:      t.trajectoryType,
        momentum:            t.momentum,
        interventionWindow:  ti.recommendedInterventionWindow,
        validationResult:    v?.validationResult   ?? null,
        forecastCalibration: v?.forecastCalibration ?? null,
        divergenceScore:     v?.divergenceScore     ?? null,
        forecastVersion:     'v1',
      });
    }

    if (rows.length === 0) return { persisted: 0, skipped: orgIds.length };

    await db.orgIntelligenceSnapshot.createMany({ data: rows });

    return { persisted: rows.length, skipped: orgIds.length - rows.length };
  }

  /**
   * Fetch the most recent snapshot per org for a given window.
   * Returns a Map keyed by organizationId.
   */
  static async getLatestSnapshots(
    orgIds:     string[],
    windowDays: 30 | 90 | 365,
  ): Promise<Map<string, { id: string; organizationId: string; snapshotAt: Date; windowDays: number; archetype: string; archetypeStability: string; archetypeConfidence: string; continuityState: string; projectedState30d: string; projectedState90d: string; continuityTrend: string; forecastStability: string; resilienceScore: number; resilienceState: string; riskLevel: string; trajectoryType: string; momentum: string; interventionWindow: string; validationResult: string | null; forecastCalibration: string | null; divergenceScore: number | null; forecastVersion: string }>> {
    // Fetch the single most recent snapshot per org using a subquery approach:
    // Get all snapshots for these orgs, ordered desc, then deduplicate in Node.js
    const snapshots = await db.orgIntelligenceSnapshot.findMany({
      where: {
        organizationId: { in: orgIds },
        windowDays,
      },
      orderBy: { snapshotAt: 'desc' },
    });

    // Deduplicate: keep only the most recent per org
    const result = new Map<string, typeof snapshots[0]>();
    for (const snap of snapshots) {
      if (!result.has(snap.organizationId)) {
        result.set(snap.organizationId, snap);
      }
    }
    return result;
  }

  /**
   * Fetch snapshot history for platform trend (last N snapshots per org).
   * Used by Sprint 13 AdminHealthCenterService.
   */
  static async getSnapshotHistory(
    orgIds:     string[],
    windowDays: 30 | 90 | 365,
    limit:      number = 30,
  ): Promise<Array<{ organizationId: string; snapshotAt: Date; continuityState: string; resilienceScore: number; archetype: string; riskLevel: string }>> {
    return db.orgIntelligenceSnapshot.findMany({
      where: {
        organizationId: { in: orgIds },
        windowDays,
      },
      orderBy: { snapshotAt: 'desc' },
      take:    limit * orgIds.length,
      select: {
        organizationId: true,
        snapshotAt:     true,
        continuityState: true,
        resilienceScore: true,
        archetype:       true,
        riskLevel:       true,
      },
    });
  }
}
