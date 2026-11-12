import { NextResponse } from "next/server";
import { AiNativeProfileService } from "@/lib/services/ai-native-profile.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { publishErrorStatus } from "@/lib/registry/publish-http";

/**
 * WP-21C-GH — AI-native profile generation (READ-ONLY, NO DB WRITE).
 *
 * GET /api/truth-canon/[id]/ai-native-profile[?entitySlug=...]
 * Admin-only. Renders index.html (+ embedded JSON-LD) and llms.txt from the
 * canon's VERIFIED TruthClaim rows for operator review.
 *
 * GENERATION ≠ PUBLISHING: this works on a DRAFT canon and does not require
 * registry consent — it renders what the Canon facts support, and the
 * response metadata states the canon status / consent state plainly. Nothing
 * here approves, publishes, or writes to the registry. The optional
 * entitySlug query param overrides the derived slug (validated); omit it to
 * use the service's slug resolution.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const { id } = await params;
    const entitySlug = new URL(request.url).searchParams.get("entitySlug") ?? undefined;
    if (entitySlug !== undefined && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entitySlug)) {
      return NextResponse.json(
        { error: "entitySlug must be lowercase letters, digits, and single hyphens (max 80 chars)." },
        { status: 400 },
      );
    }
    const result = await AiNativeProfileService.generateForCanon(id, auth.organizationId, {
      entitySlug,
    });

    return NextResponse.json({
      warning:
        "This renders AI-native profile files for review from VERIFIED Canon facts. It does not publish anything.",
      canonVersionId: result.canonVersionId,
      companyProfileId: result.companyProfileId,
      entitySlug: result.entitySlug,
      suggestedPaths: result.suggestedPaths,
      jsonLd: result.jsonLd,
      indexHtml: result.indexHtml,
      llmsTxt: result.llmsTxt,
      meta: result.meta,
    });
  } catch (err: any) {
    const message = err?.message || "Failed to generate AI-native profile";
    console.error("[truth-canon ai-native-profile]", err);
    return NextResponse.json({ error: message }, { status: publishErrorStatus(message) });
  }
}
