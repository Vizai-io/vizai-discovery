/**
 * @fileOverview ContinuityTrajectoryService — Sprint 8 Task 2.
 *
 * Identifies directional operational movement patterns from replay proxy scores.
 * Pure function — no DB queries.
 *
 * Methodology (thirds-based):
 *   1. Split proxy score array into three equal windows
 *   2. Compute average score for each third
 *   3. Derive trajectory type from inter-third deltas + oscillation count
 *   4. Derive momentum magnitude from absolute directional change
 *   5. Derive confidence from snapshot count
 *
 * Trajectory types:
 *   RECOVERING  — avg3rd significantly higher than avg1st (delta > 10)
 *   DECLINING   — avg1st significantly higher than avg3rd (delta > 10)
 *   OSCILLATING — high state oscillation count AND high variance
 *   PLATEAUED   — near-zero delta AND low variance
 *   STABLE      — default; consistent scores without strong directional movement
 *
 * Refinements:
 *   7:  forecastMemoryQuality
 *   9:  generatedFromWindow
 *   C:  forecastVersion, generatedAt, basedOnWindowDays
 *   E:  traceReferences, relatedEventIds, sourceTimelineIds, sourceMilestoneIds
 */

import type { ContinuityReplay } from './continuity-replay-service';
import type { ForecastMemoryQuality } from './continuity-forecast-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrajectoryType        = 'RECOVERING' | 'DECLINING' | 'OSCILLATING' | 'PLATEAUED' | 'STABLE';
export type TrajectoryMomentum    = 'WEAK' | 'MODERATE' | 'STRONG';
export type TrajectoryConfidence  = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ContinuityTrajectory {
  organizationId:        string;
  trajectoryType:        TrajectoryType;
  momentum:              TrajectoryMomentum;
  trajectoryConfidence:  TrajectoryConfidence;
  basedOnWindows:        number[];
  forecastMemoryQuality: ForecastMemoryQuality;  // Refinement 7
  generatedFromWindow:   { start: string; end: string }; // Refinement 9
  forecastVersion:       'v1';                  // Refinement C
  generatedAt:           string;
  basedOnWindowDays:     number[];
  traceReferences:       string[];              // Refinement E
  relatedEventIds:       string[];
  sourceTimelineIds:     string[];
  sourceMilestoneIds:    string[];
}

// ── ContinuityTrajectoryService ───────────────────────────────────────────────

export class ContinuityTrajectoryService {
  /**
   * Compute continuity trajectory from replay snapshots.
   * Pure function — no DB queries.
   */
  static computeForOrg(replay: ContinuityReplay): ContinuityTrajectory {
    const generatedAt      = new Date().toISOString();
    const { organizationId } = replay;
    const scores           = replay.snapshots.map((s) => s.proxyScore);
    const n                = scores.length;

    // ── Thirds-based analysis ─────────────────────────────────────────────────
    const third  = Math.max(1, Math.floor(n / 3));
    const avg    = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const firstAvg  = avg(scores.slice(0, third));
    const secondAvg = avg(scores.slice(third, 2 * third));
    const thirdAvg  = avg(scores.slice(2 * third));
    const delta     = thirdAvg - firstAvg;

    // Variance across all scores
    const mean     = avg(scores);
    const variance = scores.length > 1
      ? scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
      : 0;
    const oscillations = replay.transitions.length;

    // ── Trajectory type ───────────────────────────────────────────────────────
    let trajectoryType: TrajectoryType;
    if (oscillations >= 4 && variance > 200) {
      trajectoryType = 'OSCILLATING';
    } else if (delta > 10) {
      trajectoryType = 'RECOVERING';
    } else if (delta < -10) {
      trajectoryType = 'DECLINING';
    } else if (Math.abs(delta) <= 4 && variance < 100) {
      trajectoryType = 'PLATEAUED';
    } else {
      trajectoryType = 'STABLE';
    }

    // ── Momentum ──────────────────────────────────────────────────────────────
    const absDelta  = Math.abs(delta);
    const momentum: TrajectoryMomentum =
      absDelta > 20 ? 'STRONG'   :
      absDelta > 8  ? 'MODERATE' :
      'WEAK';

    // ── Trajectory confidence ─────────────────────────────────────────────────
    const trajectoryConfidence: TrajectoryConfidence =
      n >= 10 ? 'HIGH'   :
      n >= 5  ? 'MEDIUM' :
      'LOW';

    // ── Window indices used ───────────────────────────────────────────────────
    const basedOnWindows = [0, third, 2 * third];

    // ── Forecast memory quality (Refinement 7) ────────────────────────────────
    const forecastMemoryQuality: ForecastMemoryQuality =
      n >= 10 ? 'RICH'     :
      n >= 5  ? 'MODERATE' :
      'SPARSE';

    return {
      organizationId,
      trajectoryType,
      momentum,
      trajectoryConfidence,
      basedOnWindows,
      forecastMemoryQuality,
      generatedFromWindow:  replay.generatedFromWindow,
      forecastVersion:      'v1',
      generatedAt,
      basedOnWindowDays:    [replay.windowDays],
      traceReferences:      replay.traceReferences.slice(0, 10),
      relatedEventIds:      replay.relatedEventIds.slice(0, 20),
      sourceTimelineIds:    [organizationId],
      sourceMilestoneIds:   [],
    };
  }

  static computeForOrgs(
    orgIds:  string[],
    replays: Map<string, ContinuityReplay>,
  ): ContinuityTrajectory[] {
    const results: ContinuityTrajectory[] = [];
    for (const orgId of orgIds) {
      const rep = replays.get(orgId);
      if (!rep) continue;
      results.push(ContinuityTrajectoryService.computeForOrg(rep));
    }
    return results;
  }
}
