import { NextRequest, NextResponse } from "next/server";
import { ExternalRegistryPublishService } from "@/lib/services/truth-infrastructure.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { publishErrorStatus } from "@/lib/registry/publish-http";

/**
 * WP-19G — record public publication AFTER a human merged the business-registry PR. WRITES.
 * Admin-only. Body: { truthPublishRecordId, prUrl, confirmedContentHash }. The service validates
 * confirmedContentHash === RegistryProfile.payloadHash + RegistryProfile READY + TruthPublishRecord
 * DRAFT (else NO write), then flips both to PUBLISHED and records the PR URL. NO GitHub call, NO
 * business-registry write, NO MCP/signal write.
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
    const truthPublishRecordId = body?.truthPublishRecordId;
    const prUrl = body?.prUrl;
    const confirmedContentHash = body?.confirmedContentHash;
    if (!truthPublishRecordId || !prUrl || !confirmedContentHash) {
      return NextResponse.json(
        { error: "truthPublishRecordId, prUrl, and confirmedContentHash are required." },
        { status: 400 },
      );
    }

    const { id } = await params;
    const result = await ExternalRegistryPublishService.markPublished(id, auth.organizationId, {
      truthPublishRecordId,
      prUrl,
      confirmedContentHash,
    });

    return NextResponse.json({
      phase: "mark-published",
      status: "PUBLISHED",
      message: "Recorded public publication. RegistryProfile + TruthPublishRecord are now PUBLISHED.",
      registryProfileId: result.registryProfile.id,
      registryProfileStatus: result.registryProfile.status,
      truthPublishRecordId: result.publishRecord.id,
      truthPublishStatus: result.publishRecord.status,
      publishedAt: result.publishRecord.publishedAt,
    });
  } catch (err: any) {
    const message = err?.message || "Failed to mark registry candidate published";
    console.error("[registry-profile external-publish/mark-published]", err);
    return NextResponse.json({ error: message }, { status: publishErrorStatus(message) });
  }
}
