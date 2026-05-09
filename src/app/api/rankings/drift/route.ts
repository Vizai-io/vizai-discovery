/**
 * @fileOverview GET /api/rankings/drift — Ranking drift analysis.
 *
 * Returns a deterministic diff of the latest two RankingSnapshot entries
 * for the specified industry+region combination.
 *
 * Query params:
 *   industry  (string) — defaults to 'Third Party Logistics (3PL)'
 *   region    (string) — defaults to 'Western Europe'
 *
 * Response includes:
 *   drifts[]        — per-company status: STABLE | IMPROVED | DECLINED | NEW_ENTRANT | DROPPED_OUT
 *   summary         — counts by drift status
 *   snapshotIds     — { current, previous } for auditability (Refinement 6)
 *   snapshotDates   — ISO timestamps of compared snapshots
 *   insufficientData — true when fewer than 2 snapshots exist (first-run graceful state)
 *
 * No auth required — ranking data is not PII. Admin-facing but publicly readable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RankingDriftService } from '@/lib/services/ranking-drift-service';

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const { searchParams } = req.nextUrl;
  const industry = searchParams.get('industry') ?? 'Third Party Logistics (3PL)';
  const region   = searchParams.get('region')   ?? 'Western Europe';

  try {
    const report = await RankingDriftService.computeDrift(industry, region);
    return NextResponse.json(report, { status: 200 });
  } catch (err: any) {
    console.error('[rankings/drift] Failed to compute drift', {
      traceId,
      industry,
      region,
      error: err?.message,
    });
    return NextResponse.json(
      { error: 'Failed to compute ranking drift', traceId },
      { status: 500 },
    );
  }
}
