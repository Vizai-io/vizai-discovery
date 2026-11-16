/**
 * WP-21C — POST /api/verify/[token]/submit
 *
 * The server-side submit event for the public customer worksheet.
 * "Submit verification" used to be client-side only (setSubmitted(true)),
 * so nothing ever reached the platform and Jeremy was never told a
 * customer had submitted. This route is the event the notification
 * hooks onto.
 *
 * Token-aware: the scoped token in the URL IS the authorization (no
 * platform session required), validated exactly like the per-fact route.
 *
 * Behaviour:
 *   - Counts the profile's answers by verificationState and fires
 *     NotificationService.worksheetSubmitted(...) fire-and-forget to the
 *     token's organization (the org that owns the profile).
 *   - A notification failure never fails the submit: the customer's
 *     per-fact answers are already saved, and the response is still 200.
 *   - Does NOT change any Canon version, does NOT publish, does NOT
 *     change any fact. Approval/publish remain ADMIN-only steps.
 *
 * Response: { ok: true, businessName, counts: { confirmed, edited,
 *   removed, unsure, pending } }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTruthVerifyToken } from "@/lib/auth/truth-verify-token";
import { NotificationService } from "@/lib/services/notification.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    // 1. Token must be valid (signature + purpose + not expired).
    const payload = verifyTruthVerifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired." },
        { status: 401 },
      );
    }

    // 2. Profile must exist under the token's org (same scope as the page).
    const profile = await db.companyProfile.findFirst({
      where: {
        id: payload.companyProfileId,
        organizationId: payload.organizationId,
      },
      select: { id: true, businessName: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired." },
        { status: 401 },
      );
    }

    // 3. Count the answers as they stand right now.
    const grouped = await db.truthClaim.groupBy({
      by: ["verificationState"],
      where: {
        companyProfileId: payload.companyProfileId,
        organizationId: payload.organizationId,
      },
      _count: { _all: true },
    });
    const counts = {
      confirmed: 0,
      edited: 0,
      removed: 0,
      unsure: 0,
      pending: 0,
    };
    for (const row of grouped) {
      const key = row.verificationState.toLowerCase() as keyof typeof counts;
      if (key in counts) counts[key] = row._count._all;
    }

    // 4. Notify the org fire-and-forget. A notification failure must never
    // fail the submit — the answers are already saved.
    void NotificationService.worksheetSubmitted(
      payload.organizationId,
      payload.companyProfileId,
      profile.businessName,
      counts,
    ).catch((err) => {
      console.error("[verify submit] notification failed", err);
    });

    return NextResponse.json({ ok: true, businessName: profile.businessName, counts });
  } catch (err: any) {
    console.error("[verify submit]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to record verification" },
      { status: 500 },
    );
  }
}
