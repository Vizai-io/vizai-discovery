import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { TruthCanonServiceV2 } from "@/lib/services/truth-infrastructure.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });

    const { id } = await params;
    const canon = await TruthCanonServiceV2.getVersion(id, auth.organizationId);
    if (!canon) return NextResponse.json({ error: "Canon version not found." }, { status: 404 });

    return NextResponse.json({ canon });
  } catch (err: any) {
    console.error("[truth-canon/:id GET]", err);
    return NextResponse.json({ error: err.message || "Failed to load Canon version" }, { status: 500 });
  }
}
