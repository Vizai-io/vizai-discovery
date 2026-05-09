/**
 * @fileOverview POST /api/canonical-truth/[id]/publish
 *
 * Confirms a DRAFT TruthPublishRecord → PUBLISHED.
 * Previous PUBLISHED record for the same profile → SUPERSEDED (atomic).
 *
 * Optionally pushes canonical truth to GitHub if org.githubRepoUrl is set.
 * GitHub push failure is non-fatal — the publish record is still committed.
 *
 * ADMIN only. Explicit human confirmation required — no auto-publishing.
 *
 * Refinements applied:
 *  - 4: simple state machine (DRAFT → PUBLISHED → SUPERSEDED only)
 *  - 5: GitHub boundary — push-only, never polled
 *  - 6: GitHub failure explained calmly, publishing still succeeds
 *  - 8: human governance — explicit confirm endpoint
 *  - 11: audit trail preserved (SUPERSEDED records kept)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { CanonicalTruthService } from "@/lib/services/canonical-truth.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;

    const { record, github } = await CanonicalTruthService.confirmPublish(
      id,
      auth.organizationId,
    );

    // Calm publishing failure surface (refinement 6):
    // The publish record succeeded. GitHub failure is a separate, non-blocking event.
    const githubStatus = github.pushed
      ? { pushed: true }
      : github.error
        ? {
            pushed: false,
            note: "Your canonical truth was published successfully. The GitHub sync encountered an issue and will need to be retried.",
            error: github.error,
          }
        : { pushed: false, note: "No GitHub repository configured for this organization." };

    return NextResponse.json({
      published: true,
      record_id: record.id,
      version: record.version,
      published_at: record.publishedAt,
      github: githubStatus,
    });
  } catch (err: any) {
    console.error("[api/canonical-truth/publish] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to confirm publish" },
      { status: 500 },
    );
  }
}
