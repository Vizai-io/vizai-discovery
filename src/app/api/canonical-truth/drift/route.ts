/**
 * @fileOverview GET /api/canonical-truth/drift
 *
 * Returns the current drift classification for the organization's
 * canonical truth vs its latest completed scan.
 *
 * Drift is always computed fresh (stateless — refinement 2).
 * Returns null drift if no canonical profile or no completed scan exists.
 *
 * Used by:
 *  - DriftSummaryCard (dashboard)
 *  - TruthPublishPanel (monitoring)
 *  - OperationalCohesionService (internal server-side — does not call this endpoint)
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

    const canonical = await CanonicalTruthService.getCanonicalProfile(auth.organizationId);
    if (!canonical) {
      return NextResponse.json({ drift: null });
    }

    const latestScan = await db.perceptionScan.findFirst({
      where: {
        organizationId: auth.organizationId,
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

    if (!latestScan) {
      return NextResponse.json({ drift: null });
    }

    const scanInput = PerceptionDriftService.buildScanInput(latestScan);
    const drift = PerceptionDriftService.classify(canonical.business, scanInput);

    return NextResponse.json({ drift });
  } catch (err: any) {
    console.error("[api/canonical-truth/drift] Error:", err);
    return NextResponse.json(
      { error: err.message || "Drift classification failed" },
      { status: 500 },
    );
  }
}
