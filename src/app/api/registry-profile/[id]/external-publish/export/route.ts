import { NextResponse } from "next/server";
import { ExternalRegistryPublishService } from "@/lib/services/truth-infrastructure.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { publishErrorStatus } from "@/lib/registry/publish-http";

/**
 * WP-19G — export the clean public-registry artifact PACKAGE for a READY candidate (READ-ONLY).
 * Admin-only. No DB write, no GitHub call, no MCP/signal write. The operator uses this package to
 * open a manual business-registry PR; the public artifact is RegistryProfile.payload verbatim.
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
    const pkg = await ExternalRegistryPublishService.exportPackage(id, auth.organizationId);
    return NextResponse.json(pkg);
  } catch (err: any) {
    const message = err?.message || "Failed to export registry candidate package";
    console.error("[registry-profile external-publish/export]", err);
    return NextResponse.json({ error: message }, { status: publishErrorStatus(message) });
  }
}
