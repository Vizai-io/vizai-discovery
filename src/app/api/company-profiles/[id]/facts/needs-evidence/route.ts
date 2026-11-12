/**
 * @fileOverview /api/company-profiles/:id/facts/needs-evidence
 *
 * GET — GR15 "Needs Evidence" list: facts for the profile where evidenceRequired
 * is true and the evidence has not been verified, ordered by category then
 * createdAt.
 *
 * NOTE on route precedence: this is a static segment (`needs-evidence`) next to
 * the dynamic `[factId]` segment. Next.js prefers static segments, so
 * /facts/needs-evidence matches here, not [factId].
 *
 * Auth: session user or service key with `registry:read`.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CompanyProfileRepository } from "@/lib/repositories";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { hasRegistryScope, registryScopeError } from "@/lib/auth/registry-scope";
import { serializeFact } from "@/lib/truth/fact-serializer";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (!hasRegistryScope(auth, "registry:read")) {
      return NextResponse.json(registryScopeError("registry:read"), { status: 403 });
    }

    const { id } = await params;
    const profile = await CompanyProfileRepository.findById(id, auth.organizationId);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const claims = await db.truthClaim.findMany({
      where: {
        organizationId: auth.organizationId,
        companyProfileId: profile.id,
        evidenceRequired: true,
        evidenceStatus: { not: "evidence_verified" },
      },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ count: claims.length, facts: claims.map(serializeFact) });
  } catch (err: any) {
    console.error("[facts needs-evidence]", err);
    return NextResponse.json({ error: err.message || "Failed to load needs-evidence facts" }, { status: 500 });
  }
}
