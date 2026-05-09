/**
 * @fileOverview GET /api/canonical-truth — Publishing state overview
 *              POST /api/canonical-truth — Create or refresh a draft
 *
 * GET: Returns current canonical profile, active draft state, last published,
 *      and current drift classification (from latest scan).
 *      Used by TruthPublishPanel and the dashboard DriftSummaryCard.
 *
 * POST: Creates or refreshes a DRAFT TruthPublishRecord.
 *       ADMIN only. Returns the updated draft state.
 *
 * No writes to CompanyProfile. No AI. Stateless per-call (except draft upsert on POST).
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { CanonicalTruthService } from "@/lib/services/canonical-truth.service";
import { PerceptionDriftService } from "@/lib/services/perception-drift.service";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { canonical, draft, history } =
      await CanonicalTruthService.getPublishingState(auth.organizationId);

    if (!canonical) {
      return NextResponse.json({ error: "No active company profile found." }, { status: 404 });
    }

    // Drift classification from latest scan (stateless — computed fresh)
    const drift = await _computeDrift(auth.organizationId, canonical.business);

    return NextResponse.json({
      canonical,
      draft: draft
        ? {
            record_id: draft.record.id,
            version: draft.record.version,
            up_to_date: draft.upToDate,
            payload_hash: draft.record.payloadHash,
            last_published_at: draft.lastPublished?.publishedAt ?? null,
            last_published_version: draft.lastPublished?.version ?? null,
          }
        : null,
      drift,
      history: history.map((r) => ({
        id: r.id,
        version: r.version,
        status: r.status,
        published_at: r.publishedAt,
        confirmed_at: r.confirmedAt,
      })),
    });
  } catch (err: any) {
    console.error("[api/canonical-truth GET] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to load canonical truth" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const draft = await CanonicalTruthService.getOrCreateDraft(auth.organizationId);

    if (!draft) {
      return NextResponse.json({ error: "No active company profile found." }, { status: 404 });
    }

    return NextResponse.json({
      record_id: draft.record.id,
      version: draft.record.version,
      up_to_date: draft.upToDate,
      payload_hash: draft.record.payloadHash,
      last_published_at: draft.lastPublished?.publishedAt ?? null,
    });
  } catch (err: any) {
    console.error("[api/canonical-truth POST] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create draft" }, { status: 500 });
  }
}

// ── Internal: compute drift from latest scan ──────────────────────────────────

async function _computeDrift(organizationId: string, canonical: Parameters<typeof PerceptionDriftService.classify>[0]) {
  try {
    const latestScan = await db.perceptionScan.findFirst({
      where: {
        organizationId,
        status: { in: ["COMPLETE", "PARTIAL"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        scanReport: {
          select: { accuracyScore: true, coverageScore: true, consistencyScore: true },
        },
        modelResults: {
          where: { success: true },
          select: {
            success: true,
            businessType: true,
            servicesMentioned: true,
            locationsMentioned: true,
            industriesMentioned: true,
            customerTypesMentioned: true,
            differentiatorsMentioned: true,
          },
        },
      },
    });

    if (!latestScan) return null;

    const scanInput = PerceptionDriftService.buildScanInput(latestScan);
    return PerceptionDriftService.classify(canonical, scanInput);
  } catch {
    return null;
  }
}
