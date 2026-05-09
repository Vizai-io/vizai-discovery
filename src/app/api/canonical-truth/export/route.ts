/**
 * @fileOverview GET /api/canonical-truth/export
 *
 * Returns the current canonical truth as a downloadable file.
 *
 * Query params:
 *   ?format=json       → canonical-truth.json  (default)
 *   ?format=markdown   → canonical-truth.md
 *
 * Available to all authenticated org members (CLIENT + ADMIN).
 * Reads from CompanyProfile — never from a cached or stale export.
 *
 * Refinement 8: exports are always freshly generated from canonical truth.
 * The version number reflects the last PUBLISHED record (0 if never published).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { CanonicalTruthService } from "@/lib/services/canonical-truth.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const format = (request.nextUrl.searchParams.get("format") ?? "json") as
      | "json"
      | "markdown";

    if (format !== "json" && format !== "markdown") {
      return NextResponse.json(
        { error: "Invalid format. Use ?format=json or ?format=markdown" },
        { status: 400 },
      );
    }

    const result = await CanonicalTruthService.generateExport(
      auth.organizationId,
      format,
    );

    if (!result) {
      return NextResponse.json(
        { error: "No active company profile found." },
        { status: 404 },
      );
    }

    const contentType =
      format === "markdown" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8";

    return new NextResponse(result.content, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[api/canonical-truth/export] Error:", err);
    return NextResponse.json(
      { error: err.message || "Export failed" },
      { status: 500 },
    );
  }
}
