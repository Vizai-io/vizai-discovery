import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { TruthGraphService } from "@/lib/services/truth-infrastructure.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });

    const companyProfileId = request.nextUrl.searchParams.get("companyProfileId") ?? undefined;
    const graph = await TruthGraphService.getGraph(auth.organizationId, companyProfileId);
    if (!graph) return NextResponse.json({ error: "No active company profile found." }, { status: 404 });
    return NextResponse.json({ graph });
  } catch (err: any) {
    console.error("[truth-graph GET]", err);
    return NextResponse.json({ error: err.message || "Failed to load Truth Graph" }, { status: 500 });
  }
}
