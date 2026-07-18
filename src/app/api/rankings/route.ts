/**
 * Public, read-only industry ranking endpoint.
 *
 * Persisted snapshots are created by authenticated operational workflows.
 * This GET route never writes database rows from caller-controlled query
 * parameters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { RankingService } from '@/lib/services/ranking-service';

interface CacheEntry {
  data: ReturnType<typeof RankingService.simulateRankings>;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const rankingCache = new Map<string, CacheEntry>();

const RankingQuerySchema = z.object({
  industry: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
});

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
  if (!rankingCache.has(key) && rankingCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = rankingCache.keys().next().value;
    if (oldest) rankingCache.delete(oldest);
  }
  rankingCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const parsed = RankingQuerySchema.safeParse({
    industry: req.nextUrl.searchParams.get('industry') ?? 'Third Party Logistics (3PL)',
    region: req.nextUrl.searchParams.get('region') ?? 'Western Europe',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid ranking query parameters', traceId }, { status: 400 });
  }

  const { industry, region } = parsed.data;
  const cacheKey = `${industry}::${region}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ snapshot: cached, cached: true }, { status: 200 });
  }

  try {
    const existing = await db.rankingSnapshot.findFirst({
      where: { industry, region },
      orderBy: { snapshotDate: 'desc' },
    });
    if (existing) {
      const snapshot = {
        id: existing.id,
        date: existing.snapshotDate,
        industry: existing.industry,
        region: existing.region,
        entries: existing.entriesJson as unknown as ReturnType<
          typeof RankingService.simulateRankings
        >['entries'],
      };
      setCache(cacheKey, snapshot);
      return NextResponse.json({ snapshot, cached: false, preview: false }, { status: 200 });
    }
  } catch (error) {
    console.error('[rankings] snapshot read failed', {
      traceId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  const preview = RankingService.simulateRankings(industry, region);
  setCache(cacheKey, preview);
  return NextResponse.json(
    { snapshot: preview, cached: false, preview: true, traceId },
    { status: 200 },
  );
}
