import { NextResponse } from "next/server";
import {
  AuthorityArtifactService,
  RegistryProfileService,
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
    const canon = await TruthCanonServiceV2.publish(id, auth.organizationId);
    const registryProfile = await RegistryProfileService.generateForCanon(canon.id, auth.organizationId);
    const authorityMap = await AuthorityArtifactService.getAuthorityMap(auth.organizationId, canon.companyProfileId);

    return NextResponse.json({ published: true, canon, registryProfile, authorityMap });
  } catch (err: any) {
    console.error("[truth-canon publish]", err);
    return NextResponse.json({ error: err.message || "Failed to publish Canon" }, { status: 500 });
  }
}
