import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { AuthorityArtifactService } from "@/lib/services/truth-infrastructure.service";

const FORMATS = new Set(["json", "markdown", "schemaorg", "registry"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });

    const format = request.nextUrl.searchParams.get("format") ?? "json";
    if (!FORMATS.has(format)) {
      return NextResponse.json({ error: "Invalid format. Use json, markdown, schemaorg, or registry." }, { status: 400 });
    }

    const { id } = await params;
    const artifact = await AuthorityArtifactService.exportArtifacts(
      id,
      auth.organizationId,
      format as "json" | "markdown" | "schemaorg" | "registry",
    );

    if (format === "markdown") {
      return new NextResponse(String(artifact), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
    }

    return NextResponse.json(artifact);
  } catch (err: any) {
    console.error("[truth-canon export]", err);
    return NextResponse.json({ error: err.message || "Failed to export Canon artifact" }, { status: 500 });
  }
}
