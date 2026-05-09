/**
 * @fileOverview PATCH /api/admin/organizations/:id — Update org tier.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/get-auth-context";
import { OrganizationRepository } from "@/lib/repositories";
import type { OrgTier } from "@prisma/client";

const VALID_TIERS: OrgTier[] = ["STARTER", "PROFESSIONAL", "ENTERPRISE"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const tier = (body.tier as string)?.toUpperCase() as OrgTier;

  if (!VALID_TIERS.includes(tier)) {
    return NextResponse.json(
      { error: `tier must be one of: ${VALID_TIERS.join(", ")}` },
      { status: 400 },
    );
  }

  const org = await OrganizationRepository.update(id, { tier });
  return NextResponse.json({ id: org.id, tier: org.tier });
}
