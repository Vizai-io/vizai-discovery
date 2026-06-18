import { NextResponse } from "next/server";
import {
  AuthorityArtifactService,
  TruthCanonServiceV2,
} from "@/lib/services/truth-infrastructure.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";

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
    // WP-19F-UI: publishes the Canon INTERNALLY only (status PUBLISHED). The public-registry
    // candidate is NO LONGER auto-written here — prepare/approve it explicitly via
    // publish/prepare + publish/approve so it goes through operator review.
    const canon = await TruthCanonServiceV2.publish(id, auth.organizationId);
    const authorityMap = await AuthorityArtifactService.getAuthorityMap(auth.organizationId, canon.companyProfileId);

    return NextResponse.json({
      published: true,
      canon,
      authorityMap,
      note: "Canon published internally. This does NOT publish to the public registry — prepare/approve a registry candidate via publish/prepare and publish/approve.",
    });
  } catch (err: any) {
    console.error("[truth-canon publish]", err);
    return NextResponse.json({ error: err.message || "Failed to publish Canon" }, { status: 500 });
  }
}
