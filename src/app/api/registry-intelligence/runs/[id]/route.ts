import { NextResponse } from "next/server";
import { authorizeRegistryRequest } from "@/lib/registry-intelligence/api-auth";
import { getCrawlRun } from "@/lib/registry-intelligence/registry-intelligence.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeRegistryRequest("registry:read");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const run = await getCrawlRun(authorization.auth.organizationId, id);
  if (!run) return NextResponse.json({ error: "Registry crawl run not found." }, { status: 404 });
  return NextResponse.json({ run });
}
