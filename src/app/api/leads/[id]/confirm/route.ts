/**
 * @fileOverview POST /api/leads/:id/confirm
 *
 * Confirms a lead as a real opportunity. Jeremy's decision point in the
 * customer journey: a lead he has reviewed becomes an opportunity, and that
 * is what kicks off the truth-file work (profile, intake, draft, repo).
 *
 * Only NEW or CONTACTED leads can be confirmed. A lead that is already an
 * opportunity, or one that was WON or LOST, is rejected (409) so a
 * confirmation can never silently re-open a closed lead. This is a
 * human-only decision — the service key (registry:run) may call it, but
 * only Jeremy confirms a lead; no agent confirms one on its own.
 *
 * Sets status OPPORTUNITY, confirmedAt now, confirmedBy the caller's
 * identity. The opportunity agent then sets up the opportunity.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { hasRegistryScope } from "@/lib/auth/registry-scope";
import { LeadRepository } from "@/lib/repositories";

export async function POST(
  _request: NextRequest,
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
    const lead = await LeadRepository.findById(id, auth.organizationId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.status === "OPPORTUNITY") {
      return NextResponse.json(
        { error: "Lead is already an opportunity", lead_id: lead.id, status: lead.status },
        { status: 409 },
      );
    }
    if (lead.status === "WON" || lead.status === "LOST") {
      return NextResponse.json(
        { error: `Cannot confirm a ${lead.status} lead`, lead_id: lead.id, status: lead.status },
        { status: 409 },
      );
    }
    if (lead.status !== "NEW" && lead.status !== "CONTACTED") {
      return NextResponse.json(
        { error: `Cannot confirm a ${lead.status} lead`, lead_id: lead.id, status: lead.status },
        { status: 409 },
      );
    }

    const confirmedBy = auth.email || auth.uid || "admin";

    const updated = await LeadRepository.update(id, auth.organizationId, {
      status: "OPPORTUNITY",
      confirmedAt: new Date(),
      confirmedBy,
    });

    return NextResponse.json({
      id: updated.id,
      organization_id: updated.organizationId,
      perception_scan_id: updated.perceptionScanId,
      business_name: updated.businessName,
      website_url: updated.websiteUrl,
      industry: updated.industry,
      contact_name: updated.contactName,
      contact_email: updated.contactEmail,
      source: updated.source,
      status: updated.status,
      scan_snapshot: updated.scanSnapshot,
      draft_subject: updated.draftSubject,
      draft_body: updated.draftBody,
      draft_status: updated.draftStatus,
      drafted_at: updated.draftedAt,
      company_profile_id: updated.companyProfileId,
      confirmed_at: updated.confirmedAt,
      confirmed_by: updated.confirmedBy,
      intake_checklist: updated.intakeChecklist,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt,
    });
  } catch (err: any) {
    console.error("Error confirming lead:", err);
    return NextResponse.json(
      { error: err.message || "Failed to confirm lead" },
      { status: 500 },
    );
  }
}
