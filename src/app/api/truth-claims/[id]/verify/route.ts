import { NextResponse } from "next/server";
import { TruthClaimServiceV2 } from "@/lib/services/truth-infrastructure.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";

/**
 * WP-21C — POST /api/truth-claims/[id]/verify
 *
 * Runs the server-side per-claim verification gate (DEC-031..034). On success the claim
 * becomes VERIFIED with verifiedAt/verifiedBy stamped. Gate rejections return 422 with the
 * reason; the UI never sets VERIFIED directly. Admin-only.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const { id } = await params;
    const claim = await TruthClaimServiceV2.verify(id, auth.organizationId, auth.uid);
    return NextResponse.json({ verified: true, claim });
  } catch (err: any) {
    const message = err?.message || "Failed to verify claim";
    console.error("[truth-claims verify]", err);
    // Gate rejections (missing/insufficient evidence, contradiction, wrong source) are
    // client-actionable (422); "not found" is 404; anything else is a server error.
    const status = /not found/i.test(message)
      ? 404
      : /requires|blocks|contradictory|attestation|authority-grade|archived|evidence/i.test(message)
        ? 422
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
