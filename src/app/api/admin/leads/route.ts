/**
 * @fileOverview GET|PATCH /api/admin/leads — Admin lead pipeline (CRM).
 *
 * Sprint 4: Replaces Firestore `consultationRequests` collection reads/writes
 * in src/app/admin/leads/page.tsx.
 *
 * WP-22 follow-up (single lead store, decision D1): free scans persisted under
 * the 'free-scan' sentinel org ARE leads — website scans forwarded by
 * lmo-backend and platform teaser scans both carry a contact email. GET now
 * surfaces them alongside consultation requests so the admin pipeline shows
 * every lead in the single store.
 *
 * GET — Returns:
 *   leads:         ConsultationRequest rows, createdAt desc (unchanged shape)
 *   freeScanLeads: free-scan org scans mapped to lead shape, createdAt desc
 * PATCH — Updates status on a ConsultationRequest row.
 *
 * Free-scan leads are read-only here (no status column on PerceptionScan;
 * no schema changes during migration stabilization). A converted lead leaves
 * this list when onboarding claims its scan into a real org.
 *
 * Admin-only (requireAdmin — session ADMIN or service API key).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/get-auth-context';
import { db } from '@/lib/db';

// ── GET /api/admin/leads ──────────────────────────────────────────────────────

export type FreeScanLead = {
  scanId:         string;
  businessName:   string;
  website:        string | null;
  email:          string | null;
  requestContact: boolean;
  overallScore:   number | null;
  source:         'website' | 'platform';
  createdAt:      string;
};

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [leads, freeScans] = await Promise.all([
      db.consultationRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take:    200,
      }),
      db.perceptionScan.findMany({
        where:   { organizationId: 'free-scan' },
        orderBy: { createdAt: 'desc' },
        take:    200,
        select: {
          id:        true,
          createdAt: true,
          companyProfile: { select: { businessName: true, websiteUrl: true } },
          scanReport:     { select: { jsonReport: true } },
        },
      }),
    ]);

    const freeScanLeads: FreeScanLead[] = freeScans.map((scan) => {
      const report = scan.scanReport?.jsonReport as any;
      return {
        scanId:         scan.id,
        businessName:   scan.companyProfile?.businessName ?? 'Unknown business',
        website:        scan.companyProfile?.websiteUrl ?? report?.website ?? null,
        email:          report?.email ?? null,
        requestContact: report?.requestContact === true,
        // Platform mock scans: top-level overallScore. Website (lmo-backend
        // intake) scans: scores.overall.
        overallScore:   report?.overallScore ?? report?.scores?.overall ?? null,
        source:         report?.intakeSource === 'lmo-backend' ? 'website' : 'platform',
        createdAt:      scan.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ leads, freeScanLeads }, { status: 200 });
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
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
