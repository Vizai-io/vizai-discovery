import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { EvidenceService } from "@/lib/services/truth-infrastructure.service";

const EvidenceSchema = z.object({
  companyProfileId: z.string().min(1),
  type: z.enum([
    "WEBSITE",
    "SOCIAL_PROFILE",
    "DIRECTORY",
    "GOVERNMENT_RECORD",
    "TRADE_ASSOCIATION",
    "REVIEW_PLATFORM",
    "PRESS",
    "CUSTOMER_PROVIDED",
    "OTHER",
  ]),
  title: z.string().min(1).max(250),
  url: z.string().url().optional().nullable(),
  evidenceText: z.string().optional().nullable(),
  sourceDate: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });

    const companyProfileId = request.nextUrl.searchParams.get("companyProfileId") ?? undefined;
    const evidenceSources = await EvidenceService.list(auth.organizationId, companyProfileId);
    return NextResponse.json({ evidenceSources });
  } catch (err: any) {
    console.error("[evidence-sources GET]", err);
    return NextResponse.json({ error: err.message || "Failed to list evidence sources" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const parsed = EvidenceSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
    }

    const evidenceSource = await EvidenceService.create({
      organizationId: auth.organizationId,
      ...parsed.data,
    });
    return NextResponse.json({ evidenceSource }, { status: 201 });
  } catch (err: any) {
    console.error("[evidence-sources POST]", err);
    return NextResponse.json({ error: err.message || "Failed to create evidence source" }, { status: 500 });
  }
}
