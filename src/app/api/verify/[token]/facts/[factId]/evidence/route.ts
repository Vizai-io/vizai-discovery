/**
 * WP-21C (GR15) — POST /api/verify/[token]/facts/[factId]/evidence
 *
 * Token-scoped evidence FILE upload for the public customer worksheet.
 * The customer provides proof for an evidence-required claim (e.g. the
 * SQF certificate) from the worksheet — no platform login required; the
 * scoped token in the URL IS the authorization, exactly like the
 * per-fact submit route (POST /api/verify/[token]/facts/[factId]).
 *
 * Behaviour mirrors the ADMIN-only upload route
 * (POST /api/company-profiles/[id]/facts/[factId]/evidence) and reuses
 * the same validation + storage logic from
 * `@/lib/truth/evidence-upload` (10 MB limit, namespaced path,
 * `evidenceLocation` format `truth-evidence://<path>`):
 * the file lands in the private Supabase Storage bucket `truth-evidence`,
 * an EvidenceSource row + TruthClaimEvidence link are created, and the
 * fact's evidenceStatus becomes `evidence_received`.
 *
 * Upload does NOT verify anything — verification stays ADMIN-only (see
 * .../evidence/verify). Uploading evidence does NOT publish anything and
 * does NOT change publishAllowed or any Canon version.
 *
 * Scope: the fact's companyProfileId AND organizationId must match the
 * token (a token for profile A can never upload evidence for profile B)
 * — 403 otherwise. Bad token: 401. Not evidence-required, bad file, or
 * bad evidence type: 400. Already evidence_verified: 400 (re-upload
 * after verification goes through an admin, so a customer upload can
 * never silently un-verify a fact).
 *
 * Multipart form fields:
 *   file (required, <= 10 MB), evidenceType (optional, TruthEvidenceType;
 *   defaults to `customer_provided_document`), notes (optional),
 *   issuingBody (optional), issueDate (optional ISO date),
 *   expiryOrRenewalDate (optional ISO date).
 *
 * Response (201): { fact, evidence_source_id, storage_path } — `fact`
 * is the worksheet shape (same as the add-fact route returns, plus
 * evidenceStatus), so the worksheet can show the new state without a
 * reload.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { verifyTruthVerifyToken } from "@/lib/auth/truth-verify-token";
import { createAdminClient } from "@/lib/supabase/server";
import {
  EVIDENCE_TYPES,
  parseOptionalDate,
} from "@/lib/truth/fact-serializer";
import {
  EVIDENCE_BUCKET,
  MAX_EVIDENCE_FILE_BYTES,
  buildEvidenceStoragePath,
  evidenceLocationForPath,
  mapEvidenceTypeToSourceType,
  supportLevelForEvidenceType,
} from "@/lib/truth/evidence-upload";
import type { TruthEvidenceType } from "@prisma/client";

/** Form-data field -> undefined when absent/blank, else the trimmed string. */
function optionalFormString(form: FormData, name: string): string | undefined {
  const raw = form.get(name);
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Worksheet shape — same fields the verify page passes to the client. */
function publicFact(claim: {
  id: string;
  category: string;
  statement: string;
  truthType: string;
  verificationState: string;
  status: string;
  sourceUrl: string | null;
  evidenceRequired: boolean;
  evidenceStatus: string;
  key: string | null;
}) {
  return {
    id: claim.id,
    category: claim.category,
    statement: claim.statement,
    truthType: claim.truthType,
    verificationState: claim.verificationState,
    status: claim.status,
    sourceUrl: claim.sourceUrl,
    evidenceRequired: claim.evidenceRequired,
    evidenceStatus: claim.evidenceStatus,
    key: claim.key,
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

    // 4. GR15: evidence is only for evidence-required claims.
    if (!claim.evidenceRequired) {
      return NextResponse.json(
        { error: "Fact is not evidence-required; evidence upload is only for GR15 claims" },
        { status: 400 },
      );
    }

    // 5. Already-verified evidence cannot be overwritten by a customer
    // upload — that would silently un-verify the fact. Re-upload after
    // verification goes through an admin.
    if (claim.evidenceStatus === "evidence_verified") {
      return NextResponse.json(
        { error: "Evidence for this fact has already been verified." },
        { status: 400 },
      );
    }

    // Next.js truncates request bodies over 10 MB before the route runs
    // (middlewareClientMaxBodySize default), which would make formData()
    // throw and surface as a 400. Reject clearly oversized bodies up front
    // with 413; the +64 KB slack covers multipart framing around a file
    // that is itself at (or just under) the 10 MB limit.
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_EVIDENCE_FILE_BYTES + 64 * 1024) {
      return NextResponse.json(
        { error: `file exceeds the ${MAX_EVIDENCE_FILE_BYTES / 1024 / 1024} MB limit` },
        { status: 413 },
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      // A body truncated by the platform's 10 MB cap lands here (a file
      // only just over the limit, inside the header-check slack above).
      return NextResponse.json(
        { error: "Could not parse the upload — the file may exceed the 10 MB limit" },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!file || typeof file === "string" || file.size === 0) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_EVIDENCE_FILE_BYTES) {
      return NextResponse.json(
        { error: `file exceeds the ${MAX_EVIDENCE_FILE_BYTES / 1024 / 1024} MB limit` },
        { status: 413 },
      );
    }

    // Evidence type is optional from the worksheet — a customer should not
    // be blocked by the taxonomy. When supplied it must be a valid
    // TruthEvidenceType; otherwise the file is customer-provided material.
    const evidenceTypeRaw = optionalFormString(form, "evidenceType");
    if (
      evidenceTypeRaw &&
      !(EVIDENCE_TYPES as readonly string[]).includes(evidenceTypeRaw)
    ) {
      return NextResponse.json(
        { error: "evidenceType must be a valid TruthEvidenceType value" },
        { status: 400 },
      );
    }
    const evidenceType = (evidenceTypeRaw ?? "customer_provided_document") as TruthEvidenceType;

    const issuingBody = optionalFormString(form, "issuingBody") ?? null;
    const notes = optionalFormString(form, "notes");

    let issueDate: Date | null | undefined;
    let expiryOrRenewalDate: Date | null | undefined;
    try {
      issueDate = parseOptionalDate(
        optionalFormString(form, "issueDate"),
        "issueDate",
      );
      expiryOrRenewalDate = parseOptionalDate(
        optionalFormString(form, "expiryOrRenewalDate"),
        "expiryOrRenewalDate",
      );
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // ── Upload the file to the private bucket (service role bypasses RLS) ──
    const storagePath = buildEvidenceStoragePath(
      payload.organizationId,
      payload.companyProfileId,
      factId,
      file.name,
    );
    const bytes = Buffer.from(await file.arrayBuffer());
    const supabase = createAdminClient();
    const { error: uploadError } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      console.error("[verify evidence upload] storage upload failed", uploadError);
      return NextResponse.json(
        { error: `Evidence upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // ── Persist EvidenceSource + link + fact update (transaction) ──────────
    // Same creation as the ADMIN upload route, except uploadedBy marks the
    // token-scoped customer worksheet (there is no session uid here).
    try {
      const result = await db.$transaction(async (tx) => {
        const evidenceSource = await tx.evidenceSource.create({
          data: {
            organizationId: payload.organizationId,
            companyProfileId: payload.companyProfileId,
            type: mapEvidenceTypeToSourceType(evidenceType),
            title: file.name,
            url: null,
            evidenceText: notes ?? null,
            sourceDate: issueDate ?? null,
            contentHash: crypto.createHash("sha256").update(bytes).digest("hex"),
            metadata: {
              bucket: EVIDENCE_BUCKET,
              path: storagePath,
              evidenceType,
              issuingBody,
              issueDate: issueDate ? issueDate.toISOString() : null,
              expiryOrRenewalDate: expiryOrRenewalDate
                ? expiryOrRenewalDate.toISOString()
                : null,
              uploadedAt: new Date().toISOString(),
              uploadedBy: "truth-verify:customer",
            },
          },
        });

        await tx.truthClaimEvidence.create({
          data: {
            claimId: claim.id,
            evidenceSourceId: evidenceSource.id,
            supportLevel: supportLevelForEvidenceType(evidenceType),
            notes: notes ?? null,
          },
        });

        const updated = await tx.truthClaim.update({
          where: { id: claim.id },
          data: {
            evidenceStatus: "evidence_received",
            evidenceType,
            issuingBody,
            issueDate: issueDate ?? null,
            expiryOrRenewalDate: expiryOrRenewalDate ?? null,
            evidenceLocation: evidenceLocationForPath(storagePath),
          },
        });
        return { evidenceSource, updated };
      });

      return NextResponse.json(
        {
          fact: publicFact(result.updated as any),
          evidence_source_id: result.evidenceSource.id,
          storage_path: storagePath,
        },
        { status: 201 },
      );
    } catch (dbErr) {
      // DB failed after the file landed — remove the orphan object.
      await supabase.storage
        .from(EVIDENCE_BUCKET)
        .remove([storagePath])
        .catch(() => {});
      throw dbErr;
    }
  } catch (err: any) {
    console.error("[verify evidence upload]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to upload evidence" },
      { status: 500 },
    );
  }
}
