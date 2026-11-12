/**
 * WP-21C â€” POST /api/company-profiles/[id]/verify-token
 *
 * Mints a scoped customer-verification token for one company profile and
 * returns the worksheet URL to send to the customer. No email is sent here.
 *
 * Auth: ADMIN session user, OR a service key holding the `registry:review`
 * scope (service principals never inherit human ADMIN authority).
 * The profile is org-scoped: cross-org access returns 404.
 *
 * Body: { expiresInDays?: number } (default 14, clamped 1..30)
 * Response: { token, url, expiresAt, companyProfileId }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import {
  createTruthVerifyToken,
  TRUTH_VERIFY_DEFAULT_EXPIRY_DAYS,
  TRUTH_VERIFY_MAX_EXPIRY_DAYS,
} from "@/lib/auth/truth-verify-token";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = auth.role === "ADMIN";
    const hasReviewScope =
      auth.authMode === "service" && auth.scopes.includes("registry:review");
    if (!isAdmin && !hasReviewScope) {
      return NextResponse.json(
        { error: "Admin access or registry:review scope required" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const profile = await db.companyProfile.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true, organizationId: true, businessName: true },
    });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    let expiresInDays = TRUTH_VERIFY_DEFAULT_EXPIRY_DAYS;
    try {
      const body = await request.json();
      if (body && typeof body.expiresInDays === "number") {
        expiresInDays = Math.min(
          Math.max(Math.floor(body.expiresInDays), 1),
          TRUTH_VERIFY_MAX_EXPIRY_DAYS,
        );
      }
    } catch {
      // No/invalid JSON body â€” fall back to the default expiry.
    }

    const token = createTruthVerifyToken(profile.id, profile.organizationId, expiresInDays);
    const origin = new URL(request.url).origin;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    return NextResponse.json({
      token,
      url: `${origin}/verify/${token}`,
      expiresAt,
      companyProfileId: profile.id,
      businessName: profile.businessName,
    });
  } catch (err: any) {
    console.error("[verify-token]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to mint verification token" },
      { status: 500 },
    );
  }
}
