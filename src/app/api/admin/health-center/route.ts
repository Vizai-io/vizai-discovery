/**
 * @fileOverview GET /api/admin/health-center — Unified Admin Health Center data.
 *
 * Admin-only. Reads from persisted OrgIntelligenceSnapshot rows (Sprint 10)
 * rather than re-running the full Sprint 7→8→9 pipeline. Fast response.
 *
 * Returns a prioritized list of organizations needing attention, platform-level
 * trend data, and recent intelligence alerts.
 *
 * Requires Sprint 10 snapshots to be populated via
 * POST /api/cron/intelligence-snapshot.
 *
 * Query params:
 *   window: 30 | 90 | 365   (default: 90)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin }              from '@/lib/auth/get-auth-context';
import { db }                        from '@/lib/db';
import { IntelligenceSnapshotService } from '@/lib/services/intelligence-snapshot-service';
import { AdminHealthCenterService }    from '@/lib/services/admin-health-center-service';

const SENTINEL_IDS = ['free-scan', 'unassigned'];

const INTELLIGENCE_ALERT_TYPES = [
  'CONTINUITY_STATE_DECLINED',
  'ARCHETYPE_TRANSITION',
  'INTERVENTION_REQUIRED',
  'RISK_ESCALATED',
];

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

    // ── 1. Load real organizations ─────────────────────────────────────────────
    const orgs = await db.organization.findMany({
      where:   { id: { notIn: SENTINEL_IDS }, isActive: true },
      select:  { id: true, name: true, slug: true, tier: true },
      orderBy: { createdAt: 'asc' },
    });
    const orgIds    = orgs.map((o) => o.id);
    const orgMetaMap = new Map(orgs.map((o) => [o.id, { name: o.name, slug: o.slug, tier: o.tier }]));

    if (orgIds.length === 0) {
      return NextResponse.json({
        traceId, windowDays,
        hasSnapshots: false,
        message:      'No active organizations.',
        attentionItems: [], platformTrend: [], archetypeBreakdown: {},
        alertSummary: { total: 0, critical: 0, warning: 0, unread: 0 },
        orgsWithImmediate: 0, orgsAtRisk: 0, orgsHealthy: 0,
        generatedAt: new Date().toISOString(),
      });
    }

    // ── 2. Load snapshots + history + alerts in parallel ──────────────────────
    const [snapshots, snapshotHistory, recentAlerts] = await Promise.all([
      IntelligenceSnapshotService.getLatestSnapshots(orgIds, windowDays),
      IntelligenceSnapshotService.getSnapshotHistory(orgIds, windowDays, 30),
      db.notification.findMany({
        where: {
          organizationId: { in: orgIds },
          type:           { in: INTELLIGENCE_ALERT_TYPES as any[] },
          createdAt:      { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          organizationId: true,
          type:           true,
          severity:       true,
          title:          true,
          createdAt:      true,
          isRead:         true,
        },
        take: 100,
      }),
    ]);

    const hasSnapshots = snapshots.size > 0;

    // ── 3. Compute health center ───────────────────────────────────────────────
    const healthCenter = AdminHealthCenterService.compute(
      orgIds, orgMetaMap, snapshots, snapshotHistory, recentAlerts,
    );

    return NextResponse.json({
      traceId,
      windowDays,
      hasSnapshots,
      ...healthCenter,
    });

  } catch (err: any) {
    console.error('[admin/health-center] GET failed', { traceId, error: err?.message });
    return NextResponse.json({ error: 'Failed to load health center data' }, { status: 500 });
  }
}
