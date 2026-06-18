import { NextRequest, NextResponse } from "next/server";
import { RegistryProfileService } from "@/lib/services/truth-infrastructure.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { publishErrorStatus } from "@/lib/registry/publish-http";

/**
 * WP-19F-UI — APPROVE phase (WRITES, explicit operator approval).
 * Requires `expectedContentHash` (the hash the operator reviewed). `approveRegistryPublishDraft`
 * RE-PREPARES internally and compares the hash (never trusts a client artifact) + enforces the
 * gates — gate failure or hash drift => NO write. On success persists RegistryProfile READY +
 * TruthPublishRecord DRAFT (records approvedBy = auth.uid). This is an app-internal candidate only:
 * NO external business-registry publish, NO GitHub PR, NO MCP/signal write.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const expectedContentHash = body?.expectedContentHash;
    if (typeof expectedContentHash !== "string" || !expectedContentHash) {
      return NextResponse.json(
        { error: "expectedContentHash is required (the contentHash you reviewed in the prepare step)." },
        { status: 400 },
      );
    }

    const { id } = await params;
    const result = await RegistryProfileService.approveRegistryPublishDraft(id, auth.organizationId, {
      approvedBy: auth.uid,
      expectedContentHash,
    });

    return NextResponse.json({
      phase: "approve",
      status: "candidate_prepared",
      message:
        "Candidate saved (RegistryProfile READY, TruthPublishRecord DRAFT). Not externally published.",
      registryProfileId: result.registryProfile.id,
      registryProfileStatus: result.registryProfile.status,
      publishRecordId: result.publishRecord.id,
      truthPublishStatus: result.publishRecord.status,
      contentHash: result.contentHash,
      profileVersion: result.profileVersion,
    });
  } catch (err: any) {
    const message = err?.message || "Failed to approve registry candidate";
    console.error("[truth-canon publish/approve]", err);
    return NextResponse.json({ error: message }, { status: publishErrorStatus(message) });
  }
}
