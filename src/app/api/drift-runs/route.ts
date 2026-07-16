import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { DriftRunService } from "@/lib/services/truth-infrastructure.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });

    const companyProfileId = request.nextUrl.searchParams.get("companyProfileId") ?? undefined;
    const driftRuns = await DriftRunService.list(auth.organizationId, companyProfileId);
    return NextResponse.json({ driftRuns });
  } catch (err: any) {
    console.error("[drift-runs GET]", err);
    return NextResponse.json({ error: err.message || "Failed to load drift runs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const driftRun = await DriftRunService.run(auth.organizationId, body.companyProfileId);
    return NextResponse.json({ driftRun }, { status: 201 });
  } catch (err: any) {
    console.error("[drift-runs POST]", err);
    return NextResponse.json({ error: err.message || "Failed to run drift check" }, { status: 500 });
  }
}
