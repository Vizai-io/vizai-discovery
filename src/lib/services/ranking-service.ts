/**
 * @fileOverview RankingService — STATIC UTILITY — no Firebase, no Prisma.
 *
 * STATUS: Sprint 4 — Firebase removed.
 * Previously read from Firestore `rankings` collection.
 * Now: pure in-memory deterministic simulation.
 *
 * Production reads are served by GET /api/rankings (Postgres + 60s TTL cache).
 * rankings/page.tsx ("use client") calls fetch('/api/rankings') instead of
 * calling this service directly.
 *
 * simulateRankings() is kept as a public static utility because:
 *   1. GET /api/rankings uses it to generate snapshots before persisting.
 *   2. It may be used in test fixtures or admin tooling.
 *
 * Refinement 1 (Sprint 4): Retention awareness is tracked in the RankingSnapshot
 *   Prisma model (schema.prisma). See TODO there for Sprint 5 retention policy.
 */

import { RankingSnapshot, RankingEntry } from "../types";

/**
 * RankingService — static utility for deterministic ranking generation.
 * All I/O (Postgres reads/writes + caching) is handled by GET /api/rankings.
 */
export class RankingService {
  /**
   * Generates a deterministic mock ranking snapshot for a given industry + region.
   * Output is stable for the same inputs — hash-like scoring, no randomness.
   *
   * Public so GET /api/rankings can call it for snapshot generation.
   */
  static simulateRankings(industry: string, region: string): RankingSnapshot {
    const companies = [
      "Acme Logistics",
      "Global Freight Systems",
      "Nexus Supply Chain",
      "Pioneer 3PL",
      "Velocity Warehousing",
      "EcoTrans Solutions",
      "Summit Distribution",
      "BlueChip Logistics",
      "Horizon Cargo",
      "Streamline Partners",
    ];

    // Stable deterministic scores based on company name length — no randomness
    const entries: RankingEntry[] = companies
      .map((name) => {
        const baseScore = 60 + (name.length % 35);
        const change    = (name.length % 7) - 3; // -3 to +3
        return {
          companyName: name,
          score:       baseScore,
          rank:        0, // set after sort
          change,
          industry,
          region,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    return {
      id:       `mock-snapshot-${industry}-${region}`,
      date:     new Date(),
      industry,
      region,
      entries,
    };
  }
}
