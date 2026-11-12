/**
 * WP-21C-GH — AI-native profile generation service (DB-backed).
 *
 * Loads a TruthCanonVersion + its VERIFIED TruthClaim rows and renders the
 * AI-native publication files (index.html + llms.txt) via the pure renderer
 * in `../registry/ai-native-profile`.
 *
 * GENERATION ≠ PUBLISHING (design decision 5): this is rendering for review.
 * It does NOT require the canon to be APPROVED, does NOT require registry
 * listing consent, does NOT approve anything, does NOT record consent, and
 * writes NOTHING to the DB. The canon status, verification status, and
 * consent state are carried in the output metadata so the reviewer can see
 * exactly what state the files were generated from.
 *
 * Source of truth (design decision 1): VERIFIED TruthClaim rows only —
 * truthType=VERIFIED, verificationState CONFIRMED|EDITED, status=VERIFIED —
 * selected with the same WHERE clause `buildCanonicalBusiness` uses, and
 * built with the same `buildCanonicalBusinessFromClaims` (GR15 evidence
 * gate included). The flat canonPayload / official_* fields are NOT a
 * source here.
 *
 * Slug (design decision 3): the registry's canonical entitySlug. Resolved
 * in order: (1) explicit operator override, (2) the company's existing
 * RegistryProfile registryId, (3) slugified trading name derived from the
 * legal name by stripping a legal suffix ("Wills Transfer Limited" ->
 * "wills-transfer"), (4) slugified legal name. The source is recorded in
 * metadata so a wrong derivation is visible, not silent.
 */

import { db } from "@/lib/db";
import {
  buildCanonicalBusinessFromClaims,
  passesEvidenceGate,
  type VerifiedClaimRow,
} from "./truth-export.service";
import {
  buildAiNativeProfile,
  deriveCommonName,
  slugifyName,
  type AiNativeHeldClaim,
  type AiNativeProfileResult,
} from "../registry/ai-native-profile";

/** TruthClaim categories that represent evidence-gated credentials (GR15). */
const CREDENTIAL_CATEGORIES = new Set([
  "certification",
  "award",
  "license",
  "regulated-credential",
  "security-designation",
  "compliance",
  "membership",
  "accreditation",
  "safety-quality-program",
  "partner-vendor-status",
  "recognition",
]);

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function credentialName(row: {
  category: string;
  statement: string;
  value: unknown;
}): string {
  const v =
    row.value && typeof row.value === "object" && !Array.isArray(row.value)
      ? (row.value as Record<string, unknown>)
      : {};
  for (const key of ["certification", "name", "detail"]) {
    if (typeof v[key] === "string" && (v[key] as string).trim()) {
      return (v[key] as string).trim();
    }
  }
  return row.statement;
}

function utcDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export interface AiNativeGeneration extends AiNativeProfileResult {
  canonVersionId: string;
  companyProfileId: string;
}

export const AiNativeProfileService = {
  /**
   * READ-ONLY: generate the AI-native files for a canon. Throws when the
   * canon is missing or has no usable VERIFIED claims. Never writes.
   */
  async generateForCanon(
    canonVersionId: string,
    organizationId: string,
    opts: { entitySlug?: string; generatedAt?: string } = {},
  ): Promise<AiNativeGeneration> {
    const canon = await db.truthCanonVersion.findFirst({
      where: { id: canonVersionId, organizationId },
      include: { companyProfile: true },
    });
    if (!canon) throw new Error("Canon version not found.");
    if (!canon.companyProfile) throw new Error("Canon has no company profile.");

    const profile = canon.companyProfile;
    const businessName = profile.businessName;
    const websiteUrl = profile.websiteUrl;

    // VERIFIED TruthClaim rows for this canon — same selector as
    // buildCanonicalBusiness (GR13): truthType + verificationState + status.
    const rows = await db.truthClaim.findMany({
      where: {
        organizationId,
        companyProfileId: profile.id,
        canonVersionId: canon.id,
        truthType: "VERIFIED",
        verificationState: { in: ["CONFIRMED", "EDITED"] },
        status: "VERIFIED",
      },
      orderBy: { createdAt: "asc" },
      select: {
        category: true,
        statement: true,
        value: true,
        evidenceRequired: true,
        evidenceStatus: true,
        publishAllowed: true,
      },
    });
    const verifiedRows = rows as VerifiedClaimRow[];
    const business = buildCanonicalBusinessFromClaims(
      { businessName, websiteUrl },
      verifiedRows,
    );
    if (!business) {
      throw new Error(
        "No usable VERIFIED TruthClaim rows for this canon — nothing to generate.",
      );
    }
    const usableClaimCount = verifiedRows.filter(passesEvidenceGate).length;

    // Held claims (operator-only metadata): credential-category or OBSERVED
    // rows for this company that did not cross into the public files.
    const heldRows = await db.truthClaim.findMany({
      where: {
        organizationId,
        companyProfileId: profile.id,
        OR: [
          { category: { in: [...CREDENTIAL_CATEGORIES] } },
          { truthType: "OBSERVED" },
        ],
      },
      select: {
        category: true,
        statement: true,
        value: true,
        status: true,
        origin: true,
        truthType: true,
        evidenceRequired: true,
        evidenceStatus: true,
      },
    });
    const heldClaims: AiNativeHeldClaim[] = heldRows.map((c) => ({
      name: credentialName(c),
      reason:
        `${c.origin} ${c.category} (status ${c.status}, truthType ${c.truthType}) — ` +
        `held from public output: ` +
        (c.evidenceRequired
          ? `evidence required, evidenceStatus ${c.evidenceStatus} (GR15)`
          : "not a VERIFIED claim (GR13)"),
    }));

    // lastVerified: the customer-attestation evidence date (UTC date), else
    // the latest claim verification date, else the canon approval date.
    let lastVerified: string | null = null;
    let lastVerifiedSource: string | null = null;
    const attestation = await db.evidenceSource.findFirst({
      where: {
        organizationId,
        companyProfileId: profile.id,
        type: "OWNER_ATTESTATION",
      },
      orderBy: { sourceDate: "desc" },
      select: { title: true, sourceDate: true },
    });
    if (attestation?.sourceDate) {
      lastVerified = utcDate(attestation.sourceDate);
      lastVerifiedSource =
        `OWNER_ATTESTATION evidence source '${attestation.title}' ` +
        `(sourceDate ${attestation.sourceDate.toISOString()})`;
    } else {
      const latest = await db.truthClaim.aggregate({
        where: {
          organizationId,
          companyProfileId: profile.id,
          canonVersionId: canon.id,
          verifiedAt: { not: null },
        },
        _max: { verifiedAt: true },
      });
      lastVerified = utcDate(latest._max.verifiedAt ?? canon.approvedAt);
      lastVerifiedSource = latest._max.verifiedAt
        ? "latest TruthClaim.verifiedAt for this canon"
        : canon.approvedAt
          ? "TruthCanonVersion.approvedAt"
          : null;
    }

    // Slug resolution (recorded in metadata).
    const commonName = deriveCommonName(businessName);
    let entitySlug: string;
    let slugSource: "registry-profile" | "legal-suffix-strip" | "business-name" | "operator-override";
    if (opts.entitySlug) {
      if (!SLUG_PATTERN.test(opts.entitySlug) || opts.entitySlug.length > 80) {
        throw new Error(
          "entitySlug override must be lowercase letters, digits, and single hyphens (max 80 chars).",
        );
      }
      entitySlug = opts.entitySlug;
      slugSource = "operator-override";
    } else {
      const existing = await db.registryProfile.findFirst({
        where: { organizationId, companyProfileId: profile.id },
        select: { registryId: true },
      });
      if (existing) {
        entitySlug = existing.registryId;
        slugSource = "registry-profile";
      } else {
        entitySlug = slugifyName(commonName);
        slugSource = commonName !== businessName ? "legal-suffix-strip" : "business-name";
      }
    }

    const generatedAt = opts.generatedAt ?? new Date().toISOString();
    const result = buildAiNativeProfile({
      business,
      entitySlug,
      slugSource,
      commonName,
      canonVersion: canon.version,
      canonStatus: canon.status,
      // Mirror canonToAppShaped's verification block: the Canon v1.0 facts
      // were customer-verified (signed worksheet); the platform canon row
      // status (DRAFT/APPROVED/PUBLISHED) is carried separately.
      verificationStatus: "claimed_verified",
      verificationMethod: "customer-canon-approval",
      lastVerified,
      lastVerifiedSource,
      verifiedClaimCount: verifiedRows.length,
      heldClaims,
      registryConsentRecorded: profile.registryListingConsentAt !== null,
      generatedAt,
    });
    // Usable-claim count (VERIFIED rows passing the GR15 gate) alongside the
    // raw VERIFIED row count, so a reviewer can see gate attrition.
    result.meta.usableClaimCount = usableClaimCount;

    return { ...result, canonVersionId: canon.id, companyProfileId: profile.id };
  },
};
