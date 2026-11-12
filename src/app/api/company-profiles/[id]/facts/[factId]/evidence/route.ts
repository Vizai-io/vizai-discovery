/**
 * WP-21C (GR15) — POST /api/company-profiles/[id]/facts/[factId]/evidence
 *
 * Upload an evidence FILE for one evidence-required TruthClaim ("fact").
 * The file lands in the private Supabase Storage bucket `truth-evidence`
 * (never in the repo); an EvidenceSource row + TruthClaimEvidence link are
 * created, and the fact's evidenceStatus becomes `evidence_received`.
 * Upload does NOT verify the evidence — verification is a separate operator
 * action (see .../evidence/verify).
 *
 * Auth: ADMIN session user, OR a service key holding the `registry:review`
 * scope (service principals never inherit human ADMIN authority).
 * The fact must belong to auth.organizationId and the given companyProfileId
 * (cross-org access returns 404).
 *
 * Multipart form fields:
 *   file (required, <= 10 MB), evidenceType (required, TruthEvidenceType),
 *   issuingBody (optional), issueDate (optional ISO date),
 *   expiryOrRenewalDate (optional ISO date), notes (optional).
 *
 * Response (201): { fact, evidence_source_id, storage_path }
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import {
  hasRegistryScope,
  registryScopeError,
} from "@/lib/auth/registry-scope";
import { CompanyProfileRepository } from "@/lib/repositories";
import { createAdminClient } from "@/lib/supabase/server";
import {
  EVIDENCE_TYPES,
  parseOptionalDate,
  serializeFact,
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; factId: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (auth.authMode === "session") {
      if (auth.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
    } else if (!hasRegistryScope(auth, "registry:review")) {
      return NextResponse.json(registryScopeError("registry:review"), {
        status: 403,
      });
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
    });
    if (!fact) {
      return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }
    // GR15: evidence is only for evidence-required claims.
    if (!fact.evidenceRequired) {
      return NextResponse.json(
        { error: "Fact is not evidence-required; evidence upload is only for GR15 claims" },
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

    const evidenceTypeRaw = optionalFormString(form, "evidenceType");
    if (
      !evidenceTypeRaw ||
      !(EVIDENCE_TYPES as readonly string[]).includes(evidenceTypeRaw)
    ) {
      return NextResponse.json(
        { error: "evidenceType must be a valid TruthEvidenceType value" },
        { status: 400 },
      );
    }
    const evidenceType = evidenceTypeRaw as TruthEvidenceType;

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
      auth.organizationId,
      companyProfileId,
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
      console.error("[fact evidence upload] storage upload failed", uploadError);
      return NextResponse.json(
        { error: `Evidence upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // ── Persist EvidenceSource + link + fact update (transaction) ──────────
    try {
      const result = await db.$transaction(async (tx) => {
        const evidenceSource = await tx.evidenceSource.create({
          data: {
            organizationId: auth.organizationId,
            companyProfileId: profile.id,
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
              uploadedBy: auth.uid,
            },
          },
        });

        await tx.truthClaimEvidence.create({
          data: {
            claimId: fact.id,
            evidenceSourceId: evidenceSource.id,
            supportLevel: supportLevelForEvidenceType(evidenceType),
            notes: notes ?? null,
          },
        });

        const updated = await tx.truthClaim.update({
          where: { id: fact.id },
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
          fact: serializeFact(result.updated),
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
    console.error("[fact evidence upload]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to upload evidence" },
      { status: 500 },
    );
  }
}
