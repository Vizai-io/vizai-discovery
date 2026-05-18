/**
 * @fileOverview PATCH /api/admin/alerts/[id] — Alert resolution workflow.
 *
 * Admin-only. Supports two actions via `action` body field:
 *   acknowledge — marks acknowledgedAt + isRead = true
 *   resolve     — marks resolvedAt, resolvedBy (admin userId), optional resolutionNote
 *
 * GET /api/admin/alerts — paginated alert history across all orgs.
 *
 * Query params (GET):
 *   page:   number   (default: 1)
 *   limit:  number   (default: 25, max: 100)
 *   status: all | unread | acknowledged | resolved   (default: all)
 *   orgId:  string   (optional filter)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin }              from '@/lib/auth/get-auth-context';
import { db }                        from '@/lib/db';

const INTELLIGENCE_ALERT_TYPES = [
  'CONTINUITY_STATE_DECLINED',
  'ARCHETYPE_TRANSITION',
  'INTERVENTION_REQUIRED',
  'RISK_ESCALATED',
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id: alertId } = await params;

  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body   = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (!action || !['acknowledge', 'resolve'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "acknowledge" or "resolve"' },
        { status: 400 },
      );
    }

    // Validate the notification exists and is an intelligence alert type
    const notification = await db.notification.findFirst({
      where: { id: alertId, type: { in: INTELLIGENCE_ALERT_TYPES as any[] } },
      select: { id: true, resolvedAt: true },
    });

    if (!notification) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    const now = new Date();

    if (action === 'acknowledge') {
      await db.notification.update({
        where: { id: alertId },
        data:  { acknowledgedAt: now, isRead: true },
      });
      return NextResponse.json({ traceId, id: alertId, action: 'acknowledged', acknowledgedAt: now.toISOString() });
    }

    // action === 'resolve'
    const resolutionNote = typeof body?.resolutionNote === 'string'
      ? body.resolutionNote.trim().slice(0, 500) || null
      : null;

    await db.notification.update({
      where: { id: alertId },
      data:  {
        resolvedAt:     now,
        resolvedBy:     auth.uid,
        resolutionNote,
        acknowledgedAt: notification ? now : undefined,
        isRead:         true,
      },
    });

    return NextResponse.json({
      traceId,
      id: alertId,
      action:      'resolved',
      resolvedAt:  now.toISOString(),
      resolvedBy:  auth.uid,
      resolutionNote,
    });

  } catch (err: any) {
    console.error('[admin/alerts] PATCH failed', { traceId, alertId, error: err?.message });
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}
