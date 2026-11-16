/**
 * WP-21C — POST /api/verify/[token]/facts
 *
 * Token-scoped fact creation for the public customer worksheet — the
 * "add anything that might have been missed" half of the verification
 * flow. The per-fact route only accepts confirm / edit / remove /
 * unsure on existing facts; this route lets the customer add a new one.
 *
 * Token-aware: the scoped token in the URL IS the authorization (no
 * platform session required), validated exactly like the per-fact route.
 * The claim is attached to the token's companyProfileId + organizationId
 * only — a token minted for profile A can never add facts to profile B.
 *
 * Body: { category: string, statement: string }
 *   - category: non-empty string (TruthClaim.category is a free-form
 *     string, not an enum — the worksheet offers the profile's existing
 *     categories plus a free-text "Other"). Max 100 chars.
 *   - statement: non-empty string. Max 2000 chars.
 *
 * The claim is created as truthType=DECLARED, origin=DECLARED,
 * verificationState=PENDING, status=DRAFT — a customer stating a fact
 * is a declaration, never a verification. It goes through the normal
 * Confirm flow afterwards (the customer can confirm it on the worksheet
 * in the same session, or Jeremy can confirm it). It does NOT set
 * publishAllowed, does NOT set evidence fields, and does NOT change any
 * Canon version.
 *
 * Response (201): { fact } in the same shape the worksheet page passes
 * to the client, so the new fact renders with the normal controls.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTruthVerifyToken } from "@/lib/auth/truth-verify-token";

const MAX_CATEGORY_LENGTH = 100;
const MAX_STATEMENT_LENGTH = 2000;

export async function POST(
  request: NextRequest,
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
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired." },
        { status: 401 },
      );
    }

    // 3. Validate the body.
    let body: { category?: unknown; statement?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const statement = typeof body?.statement === "string" ? body.statement.trim() : "";
    if (!category) {
      return NextResponse.json(
        { error: "category is required and must be a non-empty string" },
        { status: 400 },
      );
    }
    if (category.length > MAX_CATEGORY_LENGTH) {
      return NextResponse.json(
        { error: `category must be at most ${MAX_CATEGORY_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (!statement) {
      return NextResponse.json(
        { error: "statement is required and must be a non-empty string" },
        { status: 400 },
      );
    }
    if (statement.length > MAX_STATEMENT_LENGTH) {
      return NextResponse.json(
        { error: `statement must be at most ${MAX_STATEMENT_LENGTH} characters` },
        { status: 400 },
      );
    }

    // 4. Create the claim as a declaration — never VERIFIED, never
    // publishAllowed, no Canon change.
    const claim = await db.truthClaim.create({
      data: {
        organizationId: payload.organizationId,
        companyProfileId: payload.companyProfileId,
        category,
        statement,
        value: {},
        truthType: "DECLARED",
        origin: "DECLARED",
        verificationState: "PENDING",
        status: "DRAFT",
        publishAllowed: false,
        declaredBy: "customer-worksheet",
      },
    });

    return NextResponse.json(
      {
        fact: {
          id: claim.id,
          category: claim.category,
          statement: claim.statement,
          truthType: claim.truthType,
          verificationState: claim.verificationState,
          status: claim.status,
          sourceUrl: claim.sourceUrl,
          evidenceRequired: claim.evidenceRequired,
          key: claim.key,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("[verify add-fact]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to add fact" },
      { status: 500 },
    );
  }
}
