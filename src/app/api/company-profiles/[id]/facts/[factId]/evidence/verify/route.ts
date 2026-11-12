/**
 * WP-21C (GR15) — POST /api/company-profiles/[id]/facts/[factId]/evidence/verify
 *
 * Operator action: mark the evidence attached to a fact as verified.
 * Sets the fact's evidenceStatus to `evidence_verified` and stamps the
 * attached evidence links as resolved (resolvedAt/resolvedBy/note).
 *
 * publishAllowed is set to true ONLY when the body explicitly includes
 * `publicPublishAllowed: true`. By default it is left unchanged — the
 * customer must separately allow public publishing; verification alone
 * never auto-allows it (GR15).
 *
 * Auth: ADMIN session user ONLY (requireHumanAdmin). Service keys are
 * rejected with 403 — evidence verification is an operator action.
 *
 * Body (JSON, all optional): { note?: string, publicPublishAllowed?: boolean }
 * Response: { fact }
 * Errors: 401 unauthenticated, 403 not a human ADMIN, 404 profile/fact
 * not found (or cross-org), 422 no evidence attached.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { CompanyProfileRepository } from "@/lib/repositories";
import { serializeFact } from "@/lib/truth/fact-serializer";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; factId: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Human ADMIN session only — service principals can never verify evidence.
    if (auth.authMode !== "session" || auth.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Evidence verification requires an ADMIN session user" },
        { status: 403 },
      );
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { id: companyProfileId, factId } = await params;

    const profile = await CompanyProfileRepository.findById(
      companyProfileId,
      auth.organizationId,
    );
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const fact = await db.truthClaim.findFirst({
      where: {
        id: factId,
        companyProfileId: profile.id,
        organizationId: auth.organizationId,
      },
      include: { evidenceLinks: { select: { id: true } } },
    });
    if (!fact) {
      return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    const hasAttachedEvidence =
      fact.evidenceLinks.length > 0 || Boolean(fact.evidenceLocation);
    if (!hasAttachedEvidence) {
      return NextResponse.json(
        { error: "No evidence attached" },
        { status: 422 },
      );
    }

    let body: { note?: unknown; publicPublishAllowed?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : null;
    // publishAllowed changes ONLY on an explicit `publicPublishAllowed: true`.
    const allowPublic = body.publicPublishAllowed === true;

    const updated = await db.$transaction(async (tx) => {
      if (fact.evidenceLinks.length > 0) {
        await tx.truthClaimEvidence.updateMany({
          where: { claimId: fact.id },
          data: {
            resolvedAt: new Date(),
            resolvedBy: auth.uid,
            resolutionNote: note,
          },
        });
      }
      return tx.truthClaim.update({
        where: { id: fact.id },
        data: {
          evidenceStatus: "evidence_verified",
          ...(allowPublic ? { publishAllowed: true } : {}),
        },
      });
    });

    return NextResponse.json({ fact: serializeFact(updated) });
  } catch (err: any) {
    console.error("[fact evidence verify]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to verify evidence" },
      { status: 500 },
    );
  }
}
