import { NextResponse } from "next/server";
import { RegistryProfileService } from "@/lib/services/truth-infrastructure.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { publishErrorStatus } from "@/lib/registry/publish-http";

/**
 * WP-19F-UI — CANDIDATE lookup (READ-ONLY, NO DB WRITE; GET only).
 * Returns the already-approved READY RegistryProfile candidate for a canon
 * (if any) in the `ApproveResult` shape plus a `found` flag, so the review
 * panel can restore the READY banner + Export section on reload without
 * re-prepare/re-approve:
 *   { found: true, registryProfileId, publishRecordId, registryProfileStatus,
 *     truthPublishStatus, contentHash, profileVersion }
 *   { found: false }                                     — no READY candidate
 *   { found: false, drift: true, savedHash, currentHash } — saved candidate is stale
 * Every shape also carries the registry-consent context
 * (`companyProfileId`, `registryListingConsentAt`, `registryListingConsentedBy`),
 * even `{ found: false }`, so the panel's consent control works with no READY candidate.
 * A canon that is no longer APPROVED/PUBLISHED throws inside the service
 * (same as prepare) and surfaces with the prepare status mapping (409).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const { id } = await params;
    const candidate = await RegistryProfileService.getReadyCandidate(id, auth.organizationId);
    return NextResponse.json(candidate);
  } catch (err: any) {
    const message = err?.message || "Failed to load registry candidate";
    console.error("[truth-canon publish/candidate]", err);
    return NextResponse.json({ error: message }, { status: publishErrorStatus(message) });
  }
}
