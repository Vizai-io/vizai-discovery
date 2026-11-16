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
 *
 * Origin: the returned url uses NEXT_PUBLIC_APP_URL when it is set
 * (non-empty) - that is the public origin the customer opens. When it is
 * unset or empty, the request origin is used (local-dev behaviour).
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
    // Public-origin override: the worksheet link is sent to the customer,
    // so it must open from outside this PC. When NEXT_PUBLIC_APP_URL is
    // set (non-empty) it is the origin of the returned url; when it is
    // unset or empty, fall back to the request origin (local-dev behaviour,
    // unchanged). The value is Jeremy's decision (Tailscale Serve URL or
    // deployed platform URL) - no value is set by this build. Trailing
    // slashes are stripped so the url never gets a double slash. NOTE: an
    // empty string counts as unset - ?? alone would not catch it.
    const publicOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "")
      .trim()
      .replace(/\/+$/, "");
    const origin = publicOrigin || new URL(request.url).origin;
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
