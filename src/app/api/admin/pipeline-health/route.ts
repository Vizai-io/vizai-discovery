/**
 * @fileOverview GET /api/admin/pipeline-health — Cron pipeline execution history.
 *
 * Admin-only. Reads from OperationalEvent rows where
 * eventType = 'INTELLIGENCE_SNAPSHOT_COMPLETED' to surface recent cron runs.
 *
 * Returns last N runs with: timestamp, orgs processed, alerts fired,
 * duration, and overall success/failure status.
 *
 * Query params:
 *   limit: number   (default: 10, max: 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin }              from '@/lib/auth/get-auth-context';
import { db }                        from '@/lib/db';

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rawLimit = req.nextUrl.searchParams.get('limit');
    const limit    = Math.min(50, Math.max(1, parseInt(rawLimit ?? '10', 10) || 10));

    // ── Load recent INTELLIGENCE_SNAPSHOT_COMPLETED events ────────────────────
    const events = await db.operationalEvent.findMany({
      where:   { eventType: 'INTELLIGENCE_SNAPSHOT_COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select:  {
        id:          true,
        createdAt:   true,
        severity:    true,
        message:     true,
        metadataJson: true,
        traceId:     true,
      },
      take: limit,
    });

    const runs = events.map((e) => {
      const meta = (e.metadataJson ?? {}) as Record<string, unknown>;
      return {
        id:          e.id,
        traceId:     e.traceId,
        ranAt:       e.createdAt.toISOString(),
        severity:    e.severity,
        message:     e.message,
        orgsProcessed: typeof meta.persisted === 'number' ? (meta.persisted as number) + (typeof meta.skipped === 'number' ? meta.skipped as number : 0) : null,
        persisted:   meta.persisted   ?? null,
        skipped:     meta.skipped     ?? null,
        alertsFired: meta.alertsFired ?? null,
        alertsDeduplicated: meta.alertsDeduplicated ?? null,
        durationMs:  meta.durationMs  ?? null,
      };
    });

    // ── Summary stats ─────────────────────────────────────────────────────────
    const lastRunAt     = runs[0]?.ranAt ?? null;
    const runsThisWeek  = events.filter(
      (e) => e.createdAt.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).length;

    return NextResponse.json({
      traceId,
      lastRunAt,
      runsThisWeek,
      runs,
      generatedAt: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error('[admin/pipeline-health] GET failed', { traceId, error: err?.message });
    return NextResponse.json({ error: 'Failed to load pipeline health data' }, { status: 500 });
  }
}
