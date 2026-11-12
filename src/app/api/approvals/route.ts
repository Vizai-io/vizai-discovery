/**
 * @fileOverview GET /api/approvals
 *
 * The confirm-outputs queue: everything the agents have produced that is
 * waiting for Jeremy to confirm before it goes out. One place to see it
 * all, grouped by kind:
 *
 *   reply_drafts    — leads with a reply draft in DRAFT status. Approve it
 *                     (draftStatus APPROVED) and it is ready to send;
 *                     dismiss it by clearing the draft.
 *   truth_drafts    — TruthPublishRecords in DRAFT status, one per company
 *                     profile. Publish it from the truth panel; this queue
 *                     only surfaces it.
 *   recommendations — recommendations in OPEN status (the fix plans the
 *                     Recommendation Agent built). Mark IN_PROGRESS,
 *                     COMPLETED, or DISMISSED.
 *
 * All results are org-scoped. Human ADMINs and service keys with
 * registry:read may read the queue.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { LeadRepository, RecommendationRepository } from "@/lib/repositories";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({
        counts: { reply_drafts: 0, truth_drafts: 0, recommendations: 0, total: 0 },
        reply_drafts: [],
        truth_drafts: [],
        recommendations: [],
      });
    }

    const orgId = auth.organizationId;

    // 1. Reply drafts — leads with a DRAFT reply waiting for confirmation.
    const allLeads = await LeadRepository.findByOrg(orgId);
    const replyDrafts = allLeads
      .filter((l) => l.draftStatus === "DRAFT" && l.draftBody)
      .map((l) => ({
        id: l.id,
        type: "reply_draft" as const,
        business_name: l.businessName,
        website_url: l.websiteUrl,
        contact_email: l.contactEmail,
        lead_status: l.status,
        draft_subject: l.draftSubject,
        draft_body: l.draftBody,
        drafted_at: l.draftedAt,
        created_at: l.createdAt,
      }));

    // 2. Truth drafts — DRAFT publish records, one per company profile.
    const truthRecords = await db.truthPublishRecord.findMany({
      where: { organizationId: orgId, status: "DRAFT" },
      include: {
        companyProfile: { select: { businessName: true, websiteUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const truthDrafts = truthRecords.map((r) => ({
      id: r.id,
      type: "truth_draft" as const,
      company_profile_id: r.companyProfileId,
      business_name: r.companyProfile.businessName,
      website_url: r.companyProfile.websiteUrl,
      version: r.version,
      payload_hash: r.payloadHash,
      notes: r.notes,
      created_at: r.createdAt,
    }));

    // 3. Open recommendations — the fix plans waiting for a decision.
    const recs = await RecommendationRepository.findByOrgWithScan(orgId, {
      status: "OPEN",
    });
    const recommendations = recs.map((r) => ({
      id: r.id,
      type: "recommendation" as const,
      perception_scan_id: r.perceptionScanId,
      business_name: r.perceptionScan?.companyProfile.businessName ?? null,
      priority: r.priority,
      category: r.category,
      title: r.title,
      reason: r.reason,
      recommended_action: r.recommendedAction,
      service_link: r.serviceLink,
      source: r.source,
      opened_at: r.openedAt,
      created_at: r.createdAt,
    }));

    const counts = {
      reply_drafts: replyDrafts.length,
      truth_drafts: truthDrafts.length,
      recommendations: recommendations.length,
      total: replyDrafts.length + truthDrafts.length + recommendations.length,
    };

    return NextResponse.json({
      counts,
      reply_drafts: replyDrafts,
      truth_drafts: truthDrafts,
      recommendations,
    });
  } catch (err: any) {
    console.error("Error listing approvals:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list approvals" },
      { status: 500 },
    );
  }
}
