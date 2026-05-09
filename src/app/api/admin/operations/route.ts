/**
 * @fileOverview GET /api/admin/operations — Operational state dashboard data.
 *
 * Admin-only. Returns aggregated event counts, calmness state, recent
 * critical events, and in-memory meta-observability counters.
 *
 * Refinement 7: Operational calmness state — derived from event severity counts:
 *   CALM:      zero errors/critical in last hour
 *   WATCHING:  ≥1 WARNING, no errors/critical
 *   DEGRADED:  ≥1 ERROR, no critical
 *   CRITICAL:  ≥1 CRITICAL
 *
 * Used by /admin/operations to render the "calm operational clarity" dashboard.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/get-auth-context';
import { db } from '@/lib/db';
import { OperationalEventService } from '@/lib/services/operational-event-service';

// ── Calmness state derivation (Refinement 7) ─────────────────────────────────

type CalmnessState = 'CALM' | 'WATCHING' | 'DEGRADED' | 'CRITICAL';

function deriveCalmnessState(bySeverity: Record<string, number>): CalmnessState {
  const criticalCount = bySeverity['CRITICAL'] ?? 0;
  const errorCount    = bySeverity['ERROR']    ?? 0;
  const warningCount  = bySeverity['WARNING']  ?? 0;

  if (criticalCount > 0) return 'CRITICAL';
  if (errorCount    > 0) return 'DEGRADED';
  if (warningCount  > 0) return 'WATCHING';
  return 'CALM';
}

// ── GET /api/admin/operations ─────────────────────────────────────────────────

export async function GET() {
  const traceId = crypto.randomUUID();

  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const windowMinutes = 60;

    // ── Aggregated event counts from Postgres ─────────────────────────────────
    const { bySeverity, byEventType, total } =
      await OperationalEventService.getRecentEventCounts(windowMinutes);

    // ── Calmness state (Refinement 7) ─────────────────────────────────────────
    const calmnessState = deriveCalmnessState(bySeverity);

    // ── Recent critical/error events (last 20) ────────────────────────────────
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const recentAlerts = await db.operationalEvent.findMany({
      where: {
        createdAt: { gte: since },
        severity:  { in: ['ERROR', 'CRITICAL'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id:             true,
        eventType:      true,
        severity:       true,
        source:         true,
        message:        true,
        organizationId: true,
        entityType:     true,
        entityId:       true,
        traceId:        true,
        createdAt:      true,
      },
    });

    // ── Recent events (last 50 — all severities) ──────────────────────────────
    const recentEvents = await db.operationalEvent.findMany({
      where:   { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id:        true,
        eventType: true,
        severity:  true,
        source:    true,
        message:   true,
        createdAt: true,
      },
    });

    // ── In-memory meta-observability counters (Refinement 4) ─────────────────
    const metaCounters = OperationalEventService.getMetaCounters();

    return NextResponse.json({
      traceId,
      windowMinutes,
      calmnessState,
      summary: {
        total,
        bySeverity,
        byEventType,
      },
      recentAlerts: recentAlerts.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      recentEvents: recentEvents.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      metaCounters,
    });

  } catch (err: any) {
    console.error('[admin/operations] GET failed', {
      traceId,
      error: err?.message,
    });
    return NextResponse.json(
      { error: 'Failed to load operational data' },
      { status: 500 },
    );
  }
}
