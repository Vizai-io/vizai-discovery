/**
 * @fileOverview /api/company-profiles/:id/facts
 *
 * GET  — List TruthClaim rows for the profile (org-scoped), with filters and counts.
 * POST — Add one fact (agent intake). VERIFIED is never set here; it only comes
 *        from the verification flow (PATCH .../facts/:factId with action=confirm).
 *
 * Auth: GET needs `registry:read`; POST needs an ADMIN session user or a service
 * key with `registry:run`.
 */

import { NextRequest, NextResponse } from "next/server";
import type { ClaimOrigin, Prisma, TruthClaimStatus, TruthType, TruthVerificationState } from "@prisma/client";
import { db } from "@/lib/db";
import { CompanyProfileRepository } from "@/lib/repositories";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { hasRegistryScope, registryScopeError } from "@/lib/auth/registry-scope";
import {
  CLAIM_ORIGINS,
  CLAIM_STATUSES,
  countByKey,
  EVIDENCE_TYPES,
  parseOptionalDate,
  serializeFact,
  TRUTH_TYPES,
  VERIFICATION_STATES,
} from "@/lib/truth/fact-serializer";

// ── GET ─────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (!hasRegistryScope(auth, "registry:read")) {
      return NextResponse.json(registryScopeError("registry:read"), { status: 403 });
    }

    const { id } = await params;
    const profile = await CompanyProfileRepository.findById(id, auth.organizationId);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const sp = request.nextUrl.searchParams;
    const truthType = sp.get("truthType") ?? undefined;
    const verificationState = sp.get("verificationState") ?? undefined;
    const status = sp.get("status") ?? undefined;
    const category = sp.get("category") ?? undefined;
    const evidenceRequiredRaw = sp.get("evidenceRequired") ?? undefined;

    if (truthType !== undefined && !(TRUTH_TYPES as readonly string[]).includes(truthType)) {
      return NextResponse.json({ error: `truthType must be one of ${TRUTH_TYPES.join(", ")}` }, { status: 400 });
    }
    if (verificationState !== undefined && !(VERIFICATION_STATES as readonly string[]).includes(verificationState)) {
      return NextResponse.json(
        { error: `verificationState must be one of ${VERIFICATION_STATES.join(", ")}` },
        { status: 400 },
      );
    }
    if (status !== undefined && !(CLAIM_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: `status must be one of ${CLAIM_STATUSES.join(", ")}` }, { status: 400 });
    }
    let evidenceRequired: boolean | undefined;
    if (evidenceRequiredRaw !== undefined) {
      if (evidenceRequiredRaw === "true") evidenceRequired = true;
      else if (evidenceRequiredRaw === "false") evidenceRequired = false;
      else return NextResponse.json({ error: "evidenceRequired must be true or false" }, { status: 400 });
    }

    const where: Prisma.TruthClaimWhereInput = {
      organizationId: auth.organizationId,
      companyProfileId: profile.id,
    };
    if (truthType !== undefined) where.truthType = truthType as TruthType;
    if (verificationState !== undefined) where.verificationState = verificationState as TruthVerificationState;
    if (status !== undefined) where.status = status as TruthClaimStatus;
    if (category !== undefined) where.category = category;
    if (evidenceRequired !== undefined) where.evidenceRequired = evidenceRequired;

    const claims = await db.truthClaim.findMany({
      where,
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });
    const facts = claims.map(serializeFact);

    // Counts describe the returned (filtered) set.
    return NextResponse.json({
      facts,
      counts: {
        total: facts.length,
        by_truth_type: countByKey(facts, "truth_type"),
        by_verification_state: countByKey(facts, "verification_state"),
        by_status: countByKey(facts, "status"),
      },
    });
  } catch (err: any) {
    console.error("[facts GET]", err);
    return NextResponse.json({ error: err.message || "Failed to list facts" }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.organizationId === "unassigned") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (auth.authMode === "session") {
      if (auth.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    } else if (!hasRegistryScope(auth, "registry:run")) {
      return NextResponse.json(registryScopeError("registry:run"), { status: 403 });
    }

    const { id } = await params;
    const profile = await CompanyProfileRepository.findById(id, auth.organizationId);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));

    if (typeof body.category !== "string" || body.category.trim().length === 0) {
      return NextResponse.json({ error: "category is required and must be a non-empty string" }, { status: 400 });
    }
    if (typeof body.statement !== "string" || body.statement.trim().length === 0) {
      return NextResponse.json({ error: "statement is required and must be a non-empty string" }, { status: 400 });
    }

    // VERIFIED only comes from the verification flow — never via intake.
    const truthType = body.truthType ?? "OBSERVED";
    if (!(TRUTH_TYPES as readonly string[]).includes(truthType) || truthType === "VERIFIED") {
      return NextResponse.json({ error: "truthType must be OBSERVED or DECLARED" }, { status: 400 });
    }

    const origin = body.origin ?? truthType;
    if (!(CLAIM_ORIGINS as readonly string[]).includes(origin)) {
      return NextResponse.json({ error: "origin must be OBSERVED or DECLARED" }, { status: 400 });
    }
    if (origin !== truthType) {
      return NextResponse.json({ error: "origin must match truthType" }, { status: 400 });
    }

    if (body.value !== undefined && body.value !== null && (typeof body.value !== "object" || Array.isArray(body.value))) {
      return NextResponse.json({ error: "value must be an object" }, { status: 400 });
    }
    if (body.key !== undefined && body.key !== null && typeof body.key !== "string") {
      return NextResponse.json({ error: "key must be a string" }, { status: 400 });
    }
    if (body.sourceUrl !== undefined && body.sourceUrl !== null && typeof body.sourceUrl !== "string") {
      return NextResponse.json({ error: "sourceUrl must be a string" }, { status: 400 });
    }
    if (body.declaredBy !== undefined && body.declaredBy !== null && typeof body.declaredBy !== "string") {
      return NextResponse.json({ error: "declaredBy must be a string" }, { status: 400 });
    }
    if (body.evidenceRequired !== undefined && typeof body.evidenceRequired !== "boolean") {
      return NextResponse.json({ error: "evidenceRequired must be a boolean" }, { status: 400 });
    }
    if (
      body.evidenceType !== undefined &&
      body.evidenceType !== null &&
      !(EVIDENCE_TYPES as readonly string[]).includes(body.evidenceType)
    ) {
      return NextResponse.json({ error: `evidenceType must be one of ${EVIDENCE_TYPES.join(", ")}` }, { status: 400 });
    }
    if (body.issuingBody !== undefined && body.issuingBody !== null && typeof body.issuingBody !== "string") {
      return NextResponse.json({ error: "issuingBody must be a string" }, { status: 400 });
    }
    if (
      body.canonVersionNumber !== undefined &&
      body.canonVersionNumber !== null &&
      !Number.isInteger(body.canonVersionNumber)
    ) {
      return NextResponse.json({ error: "canonVersionNumber must be an integer" }, { status: 400 });
    }

    let sourceDate: Date | null = null;
    try {
      const parsed = parseOptionalDate(body.sourceDate, "sourceDate");
      sourceDate = parsed ?? null;
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const claim = await db.truthClaim.create({
      data: {
        organizationId: auth.organizationId,
        companyProfileId: profile.id,
        category: body.category.trim(),
        statement: body.statement.trim(),
        value: body.value ?? {},
        key: body.key ?? null,
        truthType: truthType as TruthType,
        origin: origin as ClaimOrigin,
        verificationState: "PENDING",
        status: "DRAFT",
        sourceUrl: body.sourceUrl ?? null,
        sourceDate,
        declaredBy: body.declaredBy ?? null,
        evidenceRequired: body.evidenceRequired === true,
        evidenceType: body.evidenceType ?? null,
        issuingBody: body.issuingBody ?? null,
        canonVersionNumber: body.canonVersionNumber ?? null,
      },
    });

    return NextResponse.json(serializeFact(claim), { status: 201 });
  } catch (err: any) {
    console.error("[facts POST]", err);
    return NextResponse.json({ error: err.message || "Failed to create fact" }, { status: 500 });
  }
}
