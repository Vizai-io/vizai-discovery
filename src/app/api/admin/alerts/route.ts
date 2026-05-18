/**
 * @fileOverview GET /api/admin/alerts — Paginated intelligence alert history.
 *
 * Admin-only. Returns intelligence alerts across all orgs, with resolution state.
 *
 * Query params:
 *   page:   number   (default: 1)
 *   limit:  number   (default: 25, max: 100)
 *   status: all | unread | acknowledged | resolved   (default: all)
 *   orgId:  string   (optional — filter to one org)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin }              from '@/lib/auth/get-auth-context';
import { db }                        from '@/lib/db';

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
    const sp    = req.nextUrl.searchParams;
    const page  = Math.max(1, parseInt(sp.get('page')  ?? '1',  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '25', 10) || 25));
    const status = sp.get('status') ?? 'all';
    const orgId  = sp.get('orgId')  ?? null;

    // ── Build where clause ────────────────────────────────────────────────────
    const where: any = {
      type:           { in: INTELLIGENCE_ALERT_TYPES as any[] },
      organizationId: { notIn: SENTINEL_IDS },
    };

    if (orgId) where.organizationId = orgId;

    if (status === 'unread')       where.isRead     = false;
    if (status === 'acknowledged') where.AND = [{ acknowledgedAt: { not: null } }, { resolvedAt: null }];
    if (status === 'resolved')     where.resolvedAt = { not: null };

    // ── Parallel: count + page ────────────────────────────────────────────────
    const [total, alerts] = await Promise.all([
      db.notification.count({ where }),
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id:             true,
          organizationId: true,
          type:           true,
          severity:       true,
          title:          true,
          message:        true,
          isRead:         true,
          createdAt:      true,
          acknowledgedAt: true,
          resolvedAt:     true,
          resolvedBy:     true,
          resolutionNote: true,
          organization: {
            select: { name: true, slug: true, tier: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      traceId,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      alerts: alerts.map((a) => ({
        ...a,
        createdAt:      a.createdAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
        resolvedAt:     a.resolvedAt?.toISOString()     ?? null,
        state:
          a.resolvedAt     ? 'RESOLVED'     :
          a.acknowledgedAt ? 'ACKNOWLEDGED' :
          a.isRead         ? 'READ'         :
          'UNREAD',
      })),
    });

  } catch (err: any) {
    console.error('[admin/alerts] GET failed', { traceId, error: err?.message });
    return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 });
  }
}
