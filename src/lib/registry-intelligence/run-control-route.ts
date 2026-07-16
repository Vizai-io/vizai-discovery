import { NextResponse } from "next/server";
import { authorizeRegistryRequest } from "./api-auth";
import { controlCrawlRun } from "./registry-intelligence.service";
import { InvalidRunTransitionError } from "./run-state-machine";

export async function handleRunControl(
  params: Promise<{ id: string }>,
  action: "pause" | "resume" | "cancel",
): Promise<NextResponse> {
  const authorization = await authorizeRegistryRequest("registry:run");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  try {
    const run = await controlCrawlRun(authorization.auth.organizationId, id, action);
    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : `Failed to ${action} Registry crawl run`;
    const status = /not found|access denied/i.test(message) ? 404 :
      error instanceof InvalidRunTransitionError ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
