/**
 * @fileOverview GET /api/rankings — Industry leaderboard endpoint.
 *
 * Reads/generates ranking snapshots from Postgres.
 * Previously: direct RankingService.getLatestRankings() call from rankings/page.tsx (Firebase).
 * Now: server route (required because rankings page is "use client" — cannot call Prisma directly).
 *
 * Refinement 1 (Sprint 4): Retention awareness.
 *   Returns latest snapshot for industry+region. Snapshot accumulation is tracked.
 *   TODO(Sprint 5): Add retention cleanup policy — see schema.prisma RankingSnapshot model.
 *
 * Refinement 2 (Sprint 4): generationSeed in metadataJson for replayability.
 *   generationSeed = `${industry}:${region}:${date.toISOString().slice(0, 10)}`
 *   Deterministic: same seed + algorithm = same output.
 *
 * Refinement 6 (Sprint 4): In-memory 60-second TTL cache.
 *   Cache key: `${industry}::${region}`
 *   Prevents redundant Postgres reads during concurrent page loads.
 *   State resets on server restart (acceptable for deterministic data).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { RankingService } from '@/lib/services/ranking-service';
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from '@/lib/services/operational-event-service';

// ── In-memory TTL cache (Refinement 6) ───────────────────────────────────────

interface CacheEntry {
  data:      ReturnType<typeof RankingService.simulateRankings>;
  expiresAt: number;
}

const rankingCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 seconds

function getCached(key: string): ReturnType<typeof RankingService.simulateRankings> | null {
  const entry = rankingCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    rankingCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: ReturnType<typeof RankingService.simulateRankings>): void {
  rankingCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── GET /api/rankings ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const { searchParams } = req.nextUrl;
  const industry = searchParams.get('industry') ?? 'Third Party Logistics (3PL)';
  const region   = searchParams.get('region')   ?? 'Western Europe';

  const cacheKey = `${industry}::${region}`;

  // ── Check in-memory cache first (Refinement 6) ────────────────────────────
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ snapshot: cached, cached: true }, { status: 200 });
  }

  // ── Try to load latest snapshot from Postgres ─────────────────────────────
  try {
    const existing = await db.rankingSnapshot.findFirst({
      where:   { industry, region },
      orderBy: { snapshotDate: 'desc' },
    });

    if (existing) {
      const snapshot = {
        id:       existing.id,
        date:     existing.snapshotDate,
        industry: existing.industry,
        region:   existing.region,
        entries:  existing.entriesJson as any[],
      };
      setCache(cacheKey, snapshot as any);
      return NextResponse.json({ snapshot, cached: false }, { status: 200 });
    }
  } catch (err: any) {
    console.error('[rankings] Postgres read failed — falling back to simulate', {
      traceId,
      industry,
      region,
      error: err?.message,
    });
  }

  // ── Generate + persist new snapshot ──────────────────────────────────────
  const generated = RankingService.simulateRankings(industry, region);

  // Refinement 2: generationSeed for replayability
  const today = new Date().toISOString().slice(0, 10);
  const generationSeed = `${industry}:${region}:${today}`;

  try {
    const persisted = await db.rankingSnapshot.create({
      data: {
        industry,
        region,
        entriesJson:  generated.entries as any,
        metadataJson: {
          generationSeed,
          algorithmVersion: '1.0-deterministic',
          entryCount:       generated.entries.length,
          // Refinement 1: snapshot retention awareness
          // TODO(Sprint 5): implement retention cleanup — query by industry+region, delete old
        } as any,
      },
    });

    const snapshot = {
      id:       persisted.id,
      date:     persisted.snapshotDate,
      industry: persisted.industry,
      region:   persisted.region,
      entries:  generated.entries,
    };

    setCache(cacheKey, snapshot as any);

    console.log('[rankings] Snapshot generated and persisted', {
      traceId,
      snapshotId: persisted.id,
      industry,
      region,
      generationSeed,
      entryCount: generated.entries.length,
    });

    // RANKING_SNAPSHOT_GENERATED — instrumented event
    void OperationalEventService.emit({
      eventType:  EVENT_TYPES.RANKING_SNAPSHOT_GENERATED,
      severity:   SEVERITIES.INFO,
      source:     EVENT_SOURCES.RANKINGS_API,
      traceId,
      entityType: 'ranking',
      entityId:   persisted.id,
      message:    `Ranking snapshot generated for ${industry} / ${region} (${generated.entries.length} entries)`,
      metadata: {
        industry,
        region,
        generationSeed,
        entryCount: generated.entries.length,
      },
    });

    // ── Integrity assertion ────────────────────────────────────────────────
    void (async () => {
      try {
        const check = await db.rankingSnapshot.findUnique({ where: { id: persisted.id } });
        if (!check) {
          void OperationalEventService.emit({
            eventType:  EVENT_TYPES.RANKING_PIPELINE_INCOMPLETE,
            severity:   SEVERITIES.ERROR,
            source:     EVENT_SOURCES.RANKINGS_API,
            traceId,
            entityType: 'ranking',
            entityId:   persisted.id,
            message:    'Ranking pipeline incomplete — snapshot not found after persist',
            metadata: {
              industry,
              region,
              generationSeed,
              detail: 'Snapshot not found after persist — pipeline integrity failure.',
            },
          });
        }
      } catch {}
    })();

    return NextResponse.json({ snapshot, cached: false }, { status: 200 });
  } catch (persistErr: any) {
    // Persist failed — return generated data without caching
    console.error('[rankings] Failed to persist snapshot', {
      traceId,
      industry,
      region,
      error: persistErr?.message,
    });

    const snapshot = {
      id:      generated.id,
      date:    generated.date,
      industry,
      region,
      entries: generated.entries,
    };

    return NextResponse.json({ snapshot, cached: false, persistFailed: true }, { status: 200 });
  }
}
