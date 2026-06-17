import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { TruthCanonServiceV2 } from "@/lib/services/truth-infrastructure.service";

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
    const canon = await TruthCanonServiceV2.approve(id, auth.organizationId, auth.uid);
    return NextResponse.json({ approved: true, canon });
  } catch (err: any) {
    console.error("[truth-canon approve]", err);
    return NextResponse.json({ error: err.message || "Failed to approve Canon" }, { status: 500 });
  }
}
