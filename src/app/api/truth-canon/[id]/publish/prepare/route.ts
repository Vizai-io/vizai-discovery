import { NextResponse } from "next/server";
import { RegistryProfileService } from "@/lib/services/truth-infrastructure.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { publishErrorStatus, NO_EXTERNAL_PUBLISH_WARNING } from "@/lib/registry/publish-http";

/**
 * WP-19F-UI — PREPARE phase (READ-ONLY, NO DB WRITE).
 * Builds the public-registry candidate draft from the canon's TruthClaim rows for operator
 * review: clean entity-profile-v1.0 artifact, gate results, held/excluded claims, contentHash,
 * profileVersion. Writes nothing. The operator reviews this output, then calls .../publish/approve.
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
    const draft = await RegistryProfileService.prepareRegistryPublishDraft(id, auth.organizationId);
    const { packet } = draft;

    return NextResponse.json({
      phase: "prepare",
      warning: NO_EXTERNAL_PUBLISH_WARNING,
      canonVersionId: draft.canonVersionId,
      profileVersion: draft.profileVersion,
      contentHash: packet.contentHash,
      targetRegistryPath: packet.targetRegistryPath,
      artifact: packet.generatedArtifact,
      gateResults: packet.gateResults,
      heldClaimsExcluded: packet.heldClaimsExcluded,
      technicalPass: packet.technicalPass,
      readyToPublish: packet.readyToPublish, // false — operator PENDING
    });
  } catch (err: any) {
    const message = err?.message || "Failed to prepare registry candidate";
    console.error("[truth-canon publish/prepare]", err);
    return NextResponse.json({ error: message }, { status: publishErrorStatus(message) });
  }
}
