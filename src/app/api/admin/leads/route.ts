/**
 * @fileOverview GET|PATCH /api/admin/leads — Admin consultation pipeline (CRM).
 *
 * Sprint 4: Replaces Firestore `consultationRequests` collection reads/writes
 * in src/app/admin/leads/page.tsx.
 *
 * GET  — Returns all ConsultationRequest rows, ordered by createdAt desc.
 * PATCH — Updates status on a ConsultationRequest row.
 *
 * Admin-only. No org scoping (admin sees all leads).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

// ── GET /api/admin/leads ──────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const leads = await db.consultationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take:    200,
    });

    return NextResponse.json({ leads }, { status: 200 });
  } catch (err: any) {
    console.error('[admin/leads] GET failed', { error: err?.message });
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

// ── PATCH /api/admin/leads ────────────────────────────────────────────────────

const PatchSchema = z.object({
  leadId:    z.string().min(1),
  newStatus: z.string().min(1),
});

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { leadId, newStatus } = parsed.data;

  try {
    const updated = await db.consultationRequest.update({
      where: { id: leadId },
      data:  { status: newStatus, updatedAt: new Date() },
    });

    return NextResponse.json({ lead: updated }, { status: 200 });
  } catch (err: any) {
    console.error('[admin/leads] PATCH failed', { leadId, newStatus, error: err?.message });
    return NextResponse.json({ error: 'Failed to update lead status' }, { status: 500 });
  }
}
