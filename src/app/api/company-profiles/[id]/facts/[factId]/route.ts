/**
 * @fileOverview /api/company-profiles/:id/facts/:factId
 *
 * PATCH — Per-fact verification action. Body: `action` (confirm | edit | remove |
 * unsure) plus optional `value` (corrected fact value, for edit), `note`, and
 * evidence fields (evidenceStatus, evidenceType, issuingBody, issueDate,
 * expiryOrRenewalDate, evidenceLocation, publicPublishAllowed).
 *
 * - confirm: runs the server-side gate via TruthClaimServiceV2.verify() — the
 *   gate decides. On success the fact becomes CONFIRMED / VERIFIED. On gate
 *   rejection returns 422 with the reason; nothing is forced.
 * - edit: applies the corrected value/statement, parks the fact at EDITED +
 *   DRAFT (clearing any stale verification stamp), then runs the same gate.
 *   A corrected fact must still pass the gate to become VERIFIED; on rejection
 *   it stays EDITED + DRAFT and the response is 422 with the reason.
 * - remove: verificationState REMOVED, status REJECTED. Removal is a state,
 *   not a delete — the fact is excluded from the Canon.
 * - unsure: verificationState UNSURE, status left DRAFT. Unsure facts stay in
 *   the Draft Canon and are never published.
 *
 * Evidence fields, when provided, update the fact's evidence columns before the
 * action runs, so an attached evidence record survives a gate rejection.
 * evidenceStatus may only be set to evidence_verified by an ADMIN — evidence
 * verification is an operator action, not a customer action.
 *
 * Auth: ADMIN session user, or service key with `registry:review`. (The customer
 * worksheet will call these same actions via a scoped token — built separately;
 * this route only implements the ADMIN / service-key auth.)
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CompanyProfileRepository } from "@/lib/repositories";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { hasRegistryScope, registryScopeError } from "@/lib/auth/registry-scope";
import { TruthClaimServiceV2 } from "@/lib/services/truth-infrastructure.service";
import { EVIDENCE_STATUSES, EVIDENCE_TYPES, parseOptionalDate, serializeFact } from "@/lib/truth/fact-serializer";

const ACTIONS = ["confirm", "edit", "remove", "unsure"] as const;

/**
 * Run the server-side verification gate. On success stamp the fact CONFIRMED /
 * VERIFIED. On gate rejection leave the fact in its pre-gate state (EDITED +
 * DRAFT for an edit, untouched for a confirm) and return a 422 with the reason.
 * Mirrors the error classification of POST /api/truth-claims/[id]/verify.
 */
async function runVerifyGate(
  factId: string,
  organizationId: string,
  verifiedBy: string,
  verificationState: "CONFIRMED" | "EDITED",
) {
  try {
    await TruthClaimServiceV2.verify(factId, organizationId, verifiedBy);
  } catch (err: any) {
    const message = err?.message || "Verification failed";
    console.error("[facts PATCH verify gate]", err);
    const status = /not found/i.test(message)
      ? 404
      : /requires|blocks|contradictory|attestation|authority-grade|archived|evidence/i.test(message)
        ? 422
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
  const updated = await db.truthClaim.update({
    where: { id: factId },
    data: { verificationState, truthType: "VERIFIED" },
  });
  return NextResponse.json(serializeFact(updated));
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; factId: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.authMode === "session") {
      if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    } else if (!hasRegistryScope(auth, "registry:review")) {
      return NextResponse.json(registryScopeError("registry:review"), { status: 403 });
    }

    const { id, factId } = await params;
    const profile = await CompanyProfileRepository.findById(id, auth.organizationId);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const fact = await db.truthClaim.findFirst({
      where: { id: factId, organizationId: auth.organizationId, companyProfileId: profile.id },
    });
    if (!fact) return NextResponse.json({ error: "Fact not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    if (!(ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json({ error: "action must be one of confirm, edit, remove, unsure" }, { status: 400 });
    }

    if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
      return NextResponse.json({ error: "note must be a string" }, { status: 400 });
    }
    if (typeof body.note === "string" && body.note.trim().length > 0) {
      // No note column on TruthClaim — keep an audit trail in the server log.
      console.info(`[facts PATCH] fact ${fact.id} action=${action} note=${body.note.trim()}`);
    }

    // ── Evidence fields (validated up front; applied before the action so an
    //    attached evidence record survives a gate rejection) ──
    const evidenceData: Prisma.TruthClaimUpdateInput = {};
    try {
      if (body.evidenceStatus !== undefined) {
        if (!(EVIDENCE_STATUSES as readonly string[]).includes(body.evidenceStatus)) {
          return NextResponse.json(
            { error: `evidenceStatus must be one of ${EVIDENCE_STATUSES.join(", ")}` },
            { status: 400 },
          );
        }
        if (body.evidenceStatus === "evidence_verified" && auth.role !== "ADMIN") {
          return NextResponse.json({ error: "Only an ADMIN may mark evidence as verified" }, { status: 403 });
        }
        evidenceData.evidenceStatus = body.evidenceStatus;
      }
      if (body.evidenceType !== undefined) {
        if (body.evidenceType !== null && !(EVIDENCE_TYPES as readonly string[]).includes(body.evidenceType)) {
          return NextResponse.json(
            { error: `evidenceType must be one of ${EVIDENCE_TYPES.join(", ")}` },
            { status: 400 },
          );
        }
        evidenceData.evidenceType = body.evidenceType;
      }
      if (body.issuingBody !== undefined) {
        if (body.issuingBody !== null && typeof body.issuingBody !== "string") {
          return NextResponse.json({ error: "issuingBody must be a string or null" }, { status: 400 });
        }
        evidenceData.issuingBody = body.issuingBody;
      }
      if (body.issueDate !== undefined) evidenceData.issueDate = parseOptionalDate(body.issueDate, "issueDate");
      if (body.expiryOrRenewalDate !== undefined) {
        evidenceData.expiryOrRenewalDate = parseOptionalDate(body.expiryOrRenewalDate, "expiryOrRenewalDate");
      }
      if (body.evidenceLocation !== undefined) {
        if (body.evidenceLocation !== null && typeof body.evidenceLocation !== "string") {
          return NextResponse.json({ error: "evidenceLocation must be a string or null" }, { status: 400 });
        }
        evidenceData.evidenceLocation = body.evidenceLocation;
      }
      if (body.publicPublishAllowed !== undefined) {
        if (typeof body.publicPublishAllowed !== "boolean") {
          return NextResponse.json({ error: "publicPublishAllowed must be a boolean" }, { status: 400 });
        }
        evidenceData.publishAllowed = body.publicPublishAllowed;
      }
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (Object.keys(evidenceData).length > 0) {
      await db.truthClaim.update({ where: { id: fact.id }, data: evidenceData });
    }

    // ── Actions ──
    if (action === "remove") {
      const updated = await db.truthClaim.update({
        where: { id: fact.id },
        data: {
          verificationState: "REMOVED",
          status: "REJECTED",
          // A removed fact is no longer verified, whatever it was before.
          truthType: fact.origin,
          verifiedAt: null,
          verifiedBy: null,
        },
      });
      return NextResponse.json(serializeFact(updated));
    }

    if (action === "unsure") {
      const wasVerified = fact.status === "VERIFIED";
      const updated = await db.truthClaim.update({
        where: { id: fact.id },
        data: {
          verificationState: "UNSURE",
          // Normally the fact is already DRAFT; if it was VERIFIED, demote it —
          // an unsure fact must not stay published as verified.
          ...(wasVerified
            ? { status: "DRAFT", truthType: fact.origin, verifiedAt: null, verifiedBy: null }
            : {}),
        },
      });
      return NextResponse.json(serializeFact(updated));
    }

    if (action === "edit") {
      const hasValue = body.value !== undefined;
      const hasStatement = typeof body.statement === "string" && body.statement.trim().length > 0;
      if (!hasValue && !hasStatement) {
        return NextResponse.json({ error: "edit requires a corrected value or statement" }, { status: 400 });
      }
      if (body.statement !== undefined && !hasStatement) {
        return NextResponse.json({ error: "statement must be a non-empty string" }, { status: 400 });
      }
      // Park the corrected fact at DRAFT + EDITED and clear any stale stamp;
      // it must pass the gate again to become VERIFIED.
      await db.truthClaim.update({
        where: { id: fact.id },
        data: {
          ...(hasValue ? { value: body.value } : {}),
          ...(hasStatement ? { statement: body.statement.trim() } : {}),
          verificationState: "EDITED",
          status: "DRAFT",
          truthType: fact.origin,
          verifiedAt: null,
          verifiedBy: null,
        },
      });
      return runVerifyGate(fact.id, auth.organizationId, auth.uid, "EDITED");
    }

    // action === "confirm"
    return runVerifyGate(fact.id, auth.organizationId, auth.uid, "CONFIRMED");
  } catch (err: any) {
    console.error("[facts PATCH]", err);
    return NextResponse.json({ error: err.message || "Failed to update fact" }, { status: 500 });
  }
}
