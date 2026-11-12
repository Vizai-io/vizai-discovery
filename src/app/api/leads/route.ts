/**
 * @fileOverview /api/leads
 *
 * GET  — List leads for the authenticated org (optional ?status= filter).
 * POST — Create a lead. Service keys need the registry:run scope; human
 *        ADMINs may also create leads. Used by the lead-intake flow and by
 *        the hub when a lead is created from a scan.
 *
 * A lead is a potential customer who ran a free scan. It holds the scan's
 * key results as a snapshot, and the reply draft that is held for Jeremy to
 * confirm before anything is sent.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { hasRegistryScope } from "@/lib/auth/registry-scope";
import { LeadRepository } from "@/lib/repositories";
import type { LeadStatus } from "@prisma/client";

const VALID_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "OPPORTUNITY", "WON", "LOST"];

function formatLead(l: Awaited<ReturnType<typeof LeadRepository.findByOrg>>[number]) {
  return {
    id: l.id,
    organization_id: l.organizationId,
    perception_scan_id: l.perceptionScanId,
    business_name: l.businessName,
    website_url: l.websiteUrl,
    industry: l.industry,
    contact_name: l.contactName,
    contact_email: l.contactEmail,
    source: l.source,
    status: l.status,
    scan_snapshot: l.scanSnapshot,
    draft_subject: l.draftSubject,
    draft_body: l.draftBody,
    draft_status: l.draftStatus,
    drafted_at: l.draftedAt,
    company_profile_id: l.companyProfileId,
    confirmed_at: l.confirmedAt,
    confirmed_by: l.confirmedBy,
    intake_checklist: l.intakeChecklist,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ leads: [], total: 0 });
    }

    const statusParam = request.nextUrl.searchParams.get("status")?.toUpperCase() as LeadStatus | null;
    const status = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined;

    const leads = await LeadRepository.findByOrg(auth.organizationId, { status });
    return NextResponse.json({ leads: leads.map(formatLead), total: leads.length });
  } catch (err: any) {
    console.error("Error listing leads:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list leads" },
      { status: 500 },
    );
  }
}

const CreateLeadSchema = z.object({
  perceptionScanId: z.string().min(1).optional().nullable(),
  businessName: z.string().min(1).max(300),
  websiteUrl: z.string().url().optional().nullable(),
  industry: z.string().max(200).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  source: z.string().max(50).optional(),
  scanSnapshot: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (!hasRegistryScope(auth, "registry:run")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = CreateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid lead", details: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const input = parsed.data;

    // One lead per scan — return the existing one instead of duplicating.
    if (input.perceptionScanId) {
      const existing = await LeadRepository.findByScan(input.perceptionScanId, auth.organizationId);
      if (existing) {
        return NextResponse.json(formatLead(existing), { status: 200 });
      }
    }

    const lead = await LeadRepository.create({
      organizationId: auth.organizationId,
      perceptionScanId: input.perceptionScanId ?? null,
      businessName: input.businessName,
      websiteUrl: input.websiteUrl ?? null,
      industry: input.industry ?? null,
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      source: input.source ?? "FREE_SCAN",
      scanSnapshot: input.scanSnapshot,
    });

    return NextResponse.json(formatLead(lead), { status: 201 });
  } catch (err: any) {
    console.error("Error creating lead:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create lead" },
      { status: 500 },
    );
  }
}
