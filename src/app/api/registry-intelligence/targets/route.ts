import { NextRequest, NextResponse } from "next/server";
import { authorizeRegistryRequest } from "@/lib/registry-intelligence/api-auth";
import { CreateRegistryTargetSchema } from "@/lib/registry-intelligence/contracts";
import {
  createRegistryTarget,
  listRegistryTargets,
} from "@/lib/registry-intelligence/registry-intelligence.service";
import { UrlPolicyError } from "@/lib/registry-intelligence/url-policy";

export async function GET() {
  const authorization = await authorizeRegistryRequest("registry:read");
  if (!authorization.ok) return authorization.response;
  const targets = await listRegistryTargets(authorization.auth.organizationId);
  return NextResponse.json({ targets });
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeRegistryRequest("registry:policy");
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateRegistryTargetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const result = await createRegistryTarget(authorization.auth.organizationId, {
      businessName: parsed.data.business_name,
      canonicalUrl: parsed.data.canonical_url,
      companyProfileId: parsed.data.company_profile_id,
      autonomyPolicyId: parsed.data.autonomy_policy_id,
      freshnessHours: parsed.data.freshness_hours,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof UrlPolicyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to create Registry target";
    const status = /not found|access denied/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
