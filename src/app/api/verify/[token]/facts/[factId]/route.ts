/**
 * WP-21C â€” POST /api/verify/[token]/facts/[factId]
 *
 * Token-aware verification endpoint for the public customer worksheet.
 * No platform session is required: the scoped token in the URL IS the
 * authorization. The token's companyProfileId MUST match the fact's
 * companyProfileId (and organizationId) or the request is rejected 403 â€”
 * a token minted for profile A can never verify facts for profile B.
 *
 * Body: { action: "confirm" | "edit" | "remove" | "unsure", value?: string }
 *   - confirm: verificationState=CONFIRMED and truthType=VERIFIED (the
 *     customer explicitly confirmed this fact â€” GR13 "Verified" truth).
 *     The lifecycle VERIFIED status is then attempted through the
 *     server-side gate (TruthClaimServiceV2.verify); if the gate blocks
 *     (e.g. evidence still missing) the customer's CONFIRMED answer is
 *     kept and the response reports gateBlocked + gateReason â€” the
 *     customer's answer is never lost because of the gate.
 *   - edit:    statement is replaced with `value`, verificationState=EDITED.
 *   - remove:  verificationState=REMOVED.
 *   - unsure:  verificationState=UNSURE.
 *
 * This does NOT auto-increment any Canon version and does NOT publish:
 * approval/publish remain ADMIN-only steps.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTruthVerifyToken } from "@/lib/auth/truth-verify-token";
import { TruthClaimServiceV2 } from "@/lib/services/truth-infrastructure.service";

const ACTIONS = ["confirm", "edit", "remove", "unsure"] as const;
type Action = (typeof ACTIONS)[number];

function publicFact(claim: {
  id: string;
  category: string;
  statement: string;
  truthType: string;
  verificationState: string;
  status: string;
  sourceUrl: string | null;
}) {
  return {
    id: claim.id,
    category: claim.category,
    statement: claim.statement,
    truthType: claim.truthType,
    verificationState: claim.verificationState,
    status: claim.status,
    sourceUrl: claim.sourceUrl,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; factId: string }> },
) {
  try {
    const { token, factId } = await params;

    // 1. Token must be valid (signature + purpose + not expired).
    const payload = verifyTruthVerifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired." },
        { status: 401 },
      );
    }

    // 2. Fact must exist.
    const claim = await db.truthClaim.findUnique({ where: { id: factId } });
    if (!claim) {
      return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    // 3. Scope enforcement: the fact must belong to the token's profile AND org.
    if (
      claim.companyProfileId !== payload.companyProfileId ||
      claim.organizationId !== payload.organizationId
    ) {
      return NextResponse.json(
        { error: "This link does not cover that fact." },
        { status: 403 },
      );
    }

    // 4. Validate the action.
    let body: { action?: unknown; value?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const action = body?.action as Action;
    if (!ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: "action must be one of: confirm, edit, remove, unsure" },
        { status: 400 },
      );
    }

    // 5. Apply the action.
    let gateBlocked = false;
    let gateReason: string | null = null;

    if (action === "confirm") {
      const updated = await db.truthClaim.update({
        where: { id: claim.id },
        data: { verificationState: "CONFIRMED", truthType: "VERIFIED" },
      });
      // Attempt the lifecycle gate. A blocked gate never discards the
      // customer's CONFIRMED answer â€” it only withholds VERIFIED status.
      try {
        const verified = await TruthClaimServiceV2.verify(
          claim.id,
          claim.organizationId,
          "truth-verify:customer",
        );
        return NextResponse.json({ fact: publicFact(verified as any), gateBlocked: false });
      } catch (gateErr: any) {
        gateBlocked = true;
        gateReason = gateErr?.message || "Verification gate blocked this claim.";
        return NextResponse.json({
          fact: publicFact(updated as any),
          gateBlocked,
          gateReason,
        });
      }
    }

    if (action === "edit") {
      const value = typeof body?.value === "string" ? body.value.trim() : "";
      if (!value) {
        return NextResponse.json(
          { error: "value must be a non-empty string for edit" },
          { status: 400 },
        );
      }
      const updated = await db.truthClaim.update({
        where: { id: claim.id },
        data: { statement: value, verificationState: "EDITED" },
      });
      return NextResponse.json({ fact: publicFact(updated as any), gateBlocked: false });
    }

    if (action === "remove") {
      const updated = await db.truthClaim.update({
        where: { id: claim.id },
        data: { verificationState: "REMOVED" },
      });
      return NextResponse.json({ fact: publicFact(updated as any), gateBlocked: false });
    }

    // unsure
    const updated = await db.truthClaim.update({
      where: { id: claim.id },
      data: { verificationState: "UNSURE" },
    });
    return NextResponse.json({ fact: publicFact(updated as any), gateBlocked: false });
  } catch (err: any) {
    console.error("[verify submit]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to record verification" },
      { status: 500 },
    );
  }
}
