import { NextRequest, NextResponse } from "next/server";
import { requireHumanAdmin } from "@/lib/auth/get-auth-context";
import { db } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireHumanAdmin();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const profile = await db.companyProfile.findFirst({
    where: { id, organizationId: auth.organizationId, isActive: true },
    select: { id: true },
  });
  if (!profile) return NextResponse.json({ error: "Company profile not found" }, { status: 404 });

  const updated = await db.companyProfile.update({
    where: { id },
    data: {
      registryListingConsentAt: new Date(),
      registryListingConsentedBy: auth.uid,
    },
    select: {
      id: true,
      registryListingConsentAt: true,
      registryListingConsentedBy: true,
    },
  });
  return NextResponse.json({ consent: updated });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireHumanAdmin();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const profile = await db.companyProfile.findFirst({
    where: { id, organizationId: auth.organizationId, isActive: true },
    select: { id: true },
  });
  if (!profile) return NextResponse.json({ error: "Company profile not found" }, { status: 404 });

  await db.companyProfile.update({
    where: { id },
    data: {
      registryListingConsentAt: null,
      registryListingConsentedBy: null,
    },
  });
  return NextResponse.json({ revoked: true });
}
