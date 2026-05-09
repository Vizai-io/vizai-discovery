/**
 * @fileOverview RankingDriftService — Sprint 5 Task 5.
 *
 * Deterministic diff of consecutive RankingSnapshot entries for an
 * industry+region combination. Detects position changes, entrants, dropouts,
 * and score deltas between the latest and previous snapshots.
 *
 * Pure computation — reads two Postgres snapshots, diffs them, returns a report.
 * No side effects, no writes.
 *
 * Refinement 6: snapshotIds: { current, previous } included in every response
 * for auditability — callers can retrieve the raw snapshots by ID if needed.
 *
 * Used by:
 *   GET /api/rankings/drift — returns drift report for a given industry+region
 *   /admin/operations — (future) surface drift anomalies as friction signals
 */

import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RankingEntry {
  rank:       number;
  name:       string;
  score:      number;
  industry?:  string;
  region?:    string;
  [key: string]: unknown;
}

export type DriftStatus =
  | 'STABLE'            // same rank, score unchanged
  | 'IMPROVED'          // moved up in rank
  | 'DECLINED'          // moved down in rank
  | 'NEW_ENTRANT'       // in current but not in previous
  | 'DROPPED_OUT';      // in previous but not in current

export interface EntryDrift {
  name:         string;
  status:       DriftStatus;
  currentRank:  number | null;
  previousRank: number | null;
  currentScore: number | null;
  previousScore: number | null;
  rankDelta:    number | null;   // positive = improved, negative = declined
  scoreDelta:   number | null;
}

export interface RankingDriftReport {
  industry:      string;
  region:        string;
  /** Refinement 6: snapshot IDs for auditability */
  snapshotIds: {
    current:   string;
    previous:  string;
  } | null;
  snapshotDates: {
    current:  string;
    previous: string;
  } | null;
  drifts:        EntryDrift[];
  summary: {
    stable:      number;
    improved:    number;
    declined:    number;
    newEntrants: number;
    droppedOut:  number;
    totalDrifted: number;
  };
  /**
   * insufficientData: true when fewer than 2 snapshots exist.
   * This is expected on first-run — the first snapshot has nothing to compare.
   */
  insufficientData: boolean;
  generatedAt:   string;
}

// ── RankingDriftService ───────────────────────────────────────────────────────

export class RankingDriftService {
  /**
   * Computes a drift report by diffing the latest two snapshots for the
   * given industry+region combination.
   *
   * Returns `insufficientData: true` gracefully when fewer than 2 snapshots exist.
   */
  static async computeDrift(industry: string, region: string): Promise<RankingDriftReport> {
    const base: Omit<RankingDriftReport, 'drifts' | 'summary' | 'insufficientData'> = {
      industry,
      region,
      snapshotIds:   null,
      snapshotDates: null,
      generatedAt:   new Date().toISOString(),
    };

    // ── Fetch the two most recent snapshots ───────────────────────────────────
    const snapshots = await db.rankingSnapshot.findMany({
      where:   { industry, region },
      orderBy: { snapshotDate: 'desc' },
      take:    2,
      select: {
        id:           true,
        snapshotDate: true,
        entriesJson:  true,
      },
    });

    if (snapshots.length < 2) {
      return {
        ...base,
        drifts:          [],
        summary:         { stable: 0, improved: 0, declined: 0, newEntrants: 0, droppedOut: 0, totalDrifted: 0 },
        insufficientData: true,
      };
    }

    const [current, previous] = snapshots;
    const currentEntries  = (current.entriesJson  as RankingEntry[]) ?? [];
    const previousEntries = (previous.entriesJson as RankingEntry[]) ?? [];

    // ── Build lookup maps by company name ─────────────────────────────────────
    const currentMap  = new Map<string, RankingEntry>(currentEntries.map((e) => [e.name, e]));
    const previousMap = new Map<string, RankingEntry>(previousEntries.map((e) => [e.name, e]));
    const allNames    = new Set([...currentMap.keys(), ...previousMap.keys()]);

    const drifts: EntryDrift[] = [];

    for (const name of allNames) {
      const cur  = currentMap.get(name)  ?? null;
      const prev = previousMap.get(name) ?? null;

      let status: DriftStatus;
      const currentRank   = cur?.rank  ?? null;
      const previousRank  = prev?.rank ?? null;
      const currentScore  = cur?.score  ?? null;
      const previousScore = prev?.score ?? null;
      const rankDelta     = (currentRank !== null && previousRank !== null)
        ? previousRank - currentRank   // positive = moved up (lower rank number = better)
        : null;
      const scoreDelta    = (currentScore !== null && previousScore !== null)
        ? +(currentScore - previousScore).toFixed(2)
        : null;

      if (!prev) {
        status = 'NEW_ENTRANT';
      } else if (!cur) {
        status = 'DROPPED_OUT';
      } else if (rankDelta !== null && rankDelta > 0) {
        status = 'IMPROVED';
      } else if (rankDelta !== null && rankDelta < 0) {
        status = 'DECLINED';
      } else {
        status = 'STABLE';
      }

      drifts.push({ name, status, currentRank, previousRank, currentScore, previousScore, rankDelta, scoreDelta });
    }

    // Sort: CRITICAL changes first (NEW_ENTRANT, DROPPED_OUT), then by abs(rankDelta)
    const statusOrder: Record<DriftStatus, number> = {
      DROPPED_OUT:  0,
      NEW_ENTRANT:  1,
      DECLINED:     2,
      IMPROVED:     3,
      STABLE:       4,
    };
    drifts.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      const absA = Math.abs(a.rankDelta ?? 0);
      const absB = Math.abs(b.rankDelta ?? 0);
      return absB - absA;
    });

    // ── Summary counts ────────────────────────────────────────────────────────
    const summary = {
      stable:       drifts.filter((d) => d.status === 'STABLE').length,
      improved:     drifts.filter((d) => d.status === 'IMPROVED').length,
      declined:     drifts.filter((d) => d.status === 'DECLINED').length,
      newEntrants:  drifts.filter((d) => d.status === 'NEW_ENTRANT').length,
      droppedOut:   drifts.filter((d) => d.status === 'DROPPED_OUT').length,
      totalDrifted: drifts.filter((d) => d.status !== 'STABLE').length,
    };

    return {
      ...base,
      snapshotIds: {
        current:  current.id,
        previous: previous.id,
      },
      snapshotDates: {
        current:  current.snapshotDate.toISOString(),
        previous: previous.snapshotDate.toISOString(),
      },
      drifts,
      summary,
      insufficientData: false,
    };
  }
}
