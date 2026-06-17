import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { TruthCanonServiceV2 } from "@/lib/services/truth-infrastructure.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });

    const companyProfileId = request.nextUrl.searchParams.get("companyProfileId") ?? undefined;
    const state = await TruthCanonServiceV2.getState(auth.organizationId, companyProfileId);
    if (!state) return NextResponse.json({ error: "No active company profile found." }, { status: 404 });

    return NextResponse.json(state);
  } catch (err: any) {
    console.error("[truth-canon GET]", err);
    return NextResponse.json({ error: err.message || "Failed to load Truth Canon" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const canon = await TruthCanonServiceV2.createOrRefreshDraft(auth.organizationId, body.companyProfileId);

    return NextResponse.json({ canon });
  } catch (err: any) {
    console.error("[truth-canon POST]", err);
    return NextResponse.json({ error: err.message || "Failed to create Truth Canon draft" }, { status: 500 });
  }
}
