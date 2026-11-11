/**
 * @fileOverview /api/leads/:id
 *
 * GET   — Fetch a single lead (org-scoped).
 * PATCH — Update a lead's status and/or reply draft. Service keys need the
 *         registry:run scope; human ADMINs may also update. The reply draft
 *         is held here for Jeremy to confirm before anything is sent.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { hasRegistryScope } from "@/lib/auth/registry-scope";
import { LeadRepository } from "@/lib/repositories";
import type { LeadStatus, LeadDraftStatus } from "@prisma/client";

function formatLead(l: NonNullable<Awaited<ReturnType<typeof LeadRepository.findById>>>) {
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
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const lead = await LeadRepository.findById(id, auth.organizationId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json(formatLead(lead));
  } catch (err: any) {
    console.error("Error fetching lead:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch lead" },
      { status: 500 },
    );
  }
}

const UpdateLeadSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "OPPORTUNITY", "WON", "LOST"]).optional(),
  draftSubject: z.string().max(300).optional().nullable(),
  draftBody: z.string().optional().nullable(),
  draftStatus: z.enum(["NONE", "DRAFT", "APPROVED", "SENT"]).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid lead update", details: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const input = parsed.data;

    const lead = await LeadRepository.update(id, auth.organizationId, {
      ...(input.status ? { status: input.status as LeadStatus } : {}),
      ...(input.draftSubject !== undefined ? { draftSubject: input.draftSubject } : {}),
      ...(input.draftBody !== undefined ? { draftBody: input.draftBody } : {}),
      ...(input.draftStatus
        ? { draftStatus: input.draftStatus as LeadDraftStatus, draftedAt: new Date() }
        : {}),
    });

    return NextResponse.json(formatLead(lead));
  } catch (err: any) {
    if (err.message === "Lead not found or access denied") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    console.error("Error updating lead:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update lead" },
      { status: 500 },
    );
  }
}
