import { NextRequest, NextResponse } from "next/server";
import { authorizeRegistryRequest } from "@/lib/registry-intelligence/api-auth";
import { CreateCrawlRunSchema } from "@/lib/registry-intelligence/contracts";
import { createCrawlRun } from "@/lib/registry-intelligence/registry-intelligence.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeRegistryRequest("registry:run");
  if (!authorization.ok) return authorization.response;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateCrawlRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const { id } = await params;
    const result = await createCrawlRun({
      organizationId: authorization.auth.organizationId,
      targetId: id,
      triggeredBy: authorization.auth.uid,
      objective: parsed.data.objective,
      priority: parsed.data.priority,
      commandCenterRunId: parsed.data.command_center_run_id,
    });
    return NextResponse.json(result, { status: result.created ? 202 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Registry crawl run";
    const status = /not found|access denied/i.test(message) ? 404 :
      /cannot start/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
