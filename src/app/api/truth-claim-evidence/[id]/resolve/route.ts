import { NextResponse } from "next/server";
import { z } from "zod";
import { TruthClaimServiceV2 } from "@/lib/services/truth-infrastructure.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";

/**
 * WP-21C — POST /api/truth-claim-evidence/[id]/resolve
 *
 * Records resolution of a contradictory (CONTRADICTS) evidence link (DEC-034). Requires a
 * mandatory resolutionNote. Resolving unblocks the claim so it can be re-verified. Admin-only.
 */
const BodySchema = z.object({
  resolutionNote: z.string().trim().min(1).max(2000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A resolution note is required." }, { status: 422 });
    }

    const { id } = await params;
    const link = await TruthClaimServiceV2.resolveContradiction(
      id,
      auth.organizationId,
      auth.uid,
      parsed.data.resolutionNote,
    );
    return NextResponse.json({ resolved: true, link });
  } catch (err: any) {
    const message = err?.message || "Failed to resolve contradiction";
    console.error("[truth-claim-evidence resolve]", err);
    const status = /not found/i.test(message)
      ? 404
      : /required|Only contradictory/i.test(message)
        ? 422
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
