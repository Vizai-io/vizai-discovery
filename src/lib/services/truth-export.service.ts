/**
 * @fileOverview TruthExportService
 *
 * Generates deterministic, hash-stable export payloads from canonical truth.
 *
 * Refinement 8 compliance:
 *  - Stable key ordering (fixed schema structure, never dynamic keys)
 *  - Deterministic array sorting (alphabetical for all string arrays)
 *  - Schema versioning (schema_version field in every export)
 *  - Export reproducibility (same input → identical output → same SHA-256 hash)
 *
 * Formats: JSON | Markdown
 * Future: schema.org, registry payload (extend here, not elsewhere)
 *
 * Rules:
 *  - NO mutations — pure functions only
 *  - NO AI-generated content
 *  - NO non-deterministic operations (no Date.now() inside formatters)
 */

import { createHash } from "crypto";

import { db } from "@/lib/db";

// ── Canonical profile shape ────────────────────────────────────────────────────

export type CanonicalBusiness = {
  name: string;
  website: string | null;
  description: string | null;
  business_type: string | null;
  services: string[];
  locations: string[];
  industries: string[];
  differentiators: string[];
  customer_types: string[];
};

export type CanonicalExportPayload = {
  schema_version: "1.0";
  vizai_export_type: "canonical_business_truth";
  organization_id: string;
  profile_id: string;
  publish_version: number;
  generated_at: string; // ISO 8601 — caller provides, ensures reproducibility
  business: CanonicalBusiness;
};

// ── Normalization ──────────────────────────────────────────────────────────────

/**
 * Normalize a string array for deterministic output:
 * trim whitespace, remove empty strings, deduplicate, sort alphabetically.
 */
function normalizeArray(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))].sort();
}

// ── VERIFIED-claims build (Truth Canon model alignment, GR13/GR15) ─────────────

/**
 * TruthClaim row shape needed by the canonical build (subset select).
 * `value` is the claim's structured JSON (e.g. { service: "..." }).
 */
export type VerifiedClaimRow = {
  category: string;
  statement: string;
  value: unknown;
  evidenceRequired: boolean;
  evidenceStatus: string;
  publishAllowed: boolean;
};

/**
 * Extract the field value from a TruthClaim row: prefer the structured
 * `value` JSON (tries each key in order — backfilled Canon v1.0 rows and
 * buildClaims rows use slightly different key spellings), fall back to
 * parsing the templated `statement`.
 */
function claimFieldValue(claim: VerifiedClaimRow, valueKeys: string[]): string | null {
  const v = claim.value;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const key of valueKeys) {
      const raw = (v as Record<string, unknown>)[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
  }
  return parseStatementValue(claim);
}

function parseStatementValue(claim: VerifiedClaimRow): string | null {
  const s = claim.statement.trim();
  // "<name> description: <desc>" / "<name> differentiator: <diff>"
  const colon = s.match(/^(?:.*?) (?:description|differentiator):\s*(.+)$/i);
  if (colon) return colon[1].trim();
  // "<name> is a <type>."
  if (claim.category === "business_type") {
    const isA = s.match(/^.*? is a (.+?)\.?$/i);
    if (isA) return isA[1].trim();
  }
  // "<name> provides <service>." / "<name> operates in <location>."
  const provides = s.match(/^.*? (?:provides|operates in) (.+?)\.?$/i);
  if (provides) return provides[1].trim();
  // "<name> serves the <industry> industry." / "<name> serves <customer>."
  const servesIndustry = s.match(/^.*? serves the (.+?) industry\.?$/i);
  if (servesIndustry) return servesIndustry[1].trim();
  const serves = s.match(/^.*? serves (.+?)\.?$/i);
  if (serves) return serves[1].trim();
  return null;
}

/**
 * GR15 evidence gate: an evidence-required fact may be internally verified
 * but must NOT appear in canonical truth (used for public outputs) unless
 * its evidence is verified AND publishing is allowed.
 */
export function passesEvidenceGate(claim: VerifiedClaimRow): boolean {
  if (!claim.evidenceRequired) return true;
  return claim.evidenceStatus === "evidence_verified" && claim.publishAllowed;
}

/**
 * Build a CanonicalBusiness from VERIFIED TruthClaim rows.
 * Categories follow buildClaims in truth-infrastructure.service.ts
 * (`customer_segment` there; `customer_type` accepted as an alias).
 * Returns null when no usable VERIFIED row exists — the caller then falls
 * back to the flat official_* fields.
 */
export function buildCanonicalBusinessFromClaims(
  profile: { businessName: string; websiteUrl: string | null },
  claims: VerifiedClaimRow[],
): CanonicalBusiness | null {
  const usable = claims.filter(passesEvidenceGate);
  if (usable.length === 0) return null;

  const single = (category: string, valueKeys: string[]): string | null => {
    const row = usable.find((c) => c.category === category);
    return row ? claimFieldValue(row, valueKeys) : null;
  };
  const list = (categories: string[], valueKeys: string[]): string[] =>
    normalizeArray(
      usable
        .filter((c) => categories.includes(c.category))
        .map((c) => claimFieldValue(c, valueKeys))
        .filter((x): x is string => x !== null),
    );

  return {
    name: profile.businessName.trim(),
    website: profile.websiteUrl?.trim() || null,
    description: single("description", ["description"]),
    business_type: single("business_type", ["businessType", "business_type", "type"]),
    services: list(["service"], ["service"]),
    locations: list(["location"], ["location"]),
    industries: list(["industry"], ["industry"]),
    differentiators: list(["differentiator"], ["differentiator"]),
    customer_types: list(
      ["customer_segment", "customer_type"],
      ["customerType", "customer_type", "customerSegment"],
    ),
  };
}

/**
 * Build a normalized, deterministic CanonicalBusiness from CompanyProfile fields.
 * Called by CanonicalTruthService — not directly.
 *
 * Truth Canon model alignment (GR13): when VERIFIED TruthClaim rows exist for
 * the profile (truthType=VERIFIED, verificationState CONFIRMED/EDITED,
 * status=VERIFIED, passing the GR15 evidence gate), the business is built
 * FROM THOSE ROWS — Observed/Declared facts never enter canonical truth.
 * When no usable VERIFIED row exists, falls back to the flat official_*
 * fields (migration fallback; the flat fields stay as they are).
 */
export async function buildCanonicalBusiness(profile: {
  id: string;
  organizationId: string;
  businessName: string;
  websiteUrl: string | null;
  officialDescription: string | null;
  officialBusinessType: string | null;
  officialServices: string[];
  officialLocations: string[];
  officialIndustries: string[];
  officialDifferentiators: string[];
  officialCustomerTypes: string[];
}): Promise<CanonicalBusiness> {
  const flat: CanonicalBusiness = {
    name: profile.businessName.trim(),
    website: profile.websiteUrl?.trim() || null,
    description: profile.officialDescription?.trim() || null,
    business_type: profile.officialBusinessType?.trim() || null,
    services: normalizeArray(profile.officialServices),
    locations: normalizeArray(profile.officialLocations),
    industries: normalizeArray(profile.officialIndustries),
    differentiators: normalizeArray(profile.officialDifferentiators),
    customer_types: normalizeArray(profile.officialCustomerTypes),
  };

  const claims = await db.truthClaim.findMany({
    where: {
      organizationId: profile.organizationId,
      companyProfileId: profile.id,
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

  const fromClaims = buildCanonicalBusinessFromClaims(profile, claims);
  if (fromClaims) {
    const usable = claims.filter(passesEvidenceGate).length;
    console.info(
      `[canonical-truth] source=verified-claims profile=${profile.id} verified=${claims.length} usable=${usable}`,
    );
    return fromClaims;
  }
  console.info(
    `[canonical-truth] source=flat-fallback profile=${profile.id} verified=${claims.length}`,
  );
  return flat;
}

// ── Export formatters ──────────────────────────────────────────────────────────

export const TruthExportService = {
  /**
   * Build the full versioned export payload.
   * `generatedAt` is caller-supplied for reproducibility — the same
   * canonical truth at the same version always produces the same payload.
   */
  buildPayload(
    organizationId: string,
    profileId: string,
    version: number,
    business: CanonicalBusiness,
    generatedAt: string,
  ): CanonicalExportPayload {
    return {
      schema_version: "1.0",
      vizai_export_type: "canonical_business_truth",
      organization_id: organizationId,
      profile_id: profileId,
      publish_version: version,
      generated_at: generatedAt,
      business,
    };
  },

  /**
   * Compute a SHA-256 hash of the canonical payload.
   * Hash is computed over the `business` fields only (excluding metadata like
   * generated_at) so the hash is stable across publish timestamps but reflects
   * any change in canonical truth content.
   */
  computeHash(business: CanonicalBusiness): string {
    // Deterministic JSON: fixed key order, no metadata that changes per-call
    const stable = JSON.stringify({
      name: business.name,
      website: business.website,
      description: business.description,
      business_type: business.business_type,
      services: business.services,
      locations: business.locations,
      industries: business.industries,
      differentiators: business.differentiators,
      customer_types: business.customer_types,
    });
    return createHash("sha256").update(stable).digest("hex");
  },

  /**
   * Serialize payload to pretty-printed JSON string.
   */
  toJSON(payload: CanonicalExportPayload): string {
    return JSON.stringify(payload, null, 2);
  },

  /**
   * Serialize payload to structured Markdown with YAML frontmatter.
   * Human-readable, stable, suitable for GitHub publication.
   */
  toMarkdown(payload: CanonicalExportPayload): string {
    const { business: b, publish_version, generated_at, organization_id, profile_id } = payload;

    const frontmatter = [
      "---",
      `schema_version: "1.0"`,
      `export_type: canonical_business_truth`,
      `organization_id: "${organization_id}"`,
      `profile_id: "${profile_id}"`,
      `publish_version: ${publish_version}`,
      `generated_at: "${generated_at}"`,
      "---",
    ].join("\n");

    const sections: string[] = [
      frontmatter,
      "",
      `# Canonical Business Truth — ${b.name}`,
      "",
    ];

    if (b.description) {
      sections.push("## About", "", b.description, "");
    }

    if (b.business_type) {
      sections.push("## Business Type", "", b.business_type, "");
    }

    if (b.website) {
      sections.push("## Website", "", b.website, "");
    }

    if (b.services.length > 0) {
      sections.push("## Services", "", ...b.services.map((s) => `- ${s}`), "");
    }

    if (b.locations.length > 0) {
      sections.push("## Locations", "", ...b.locations.map((l) => `- ${l}`), "");
    }

    if (b.industries.length > 0) {
      sections.push("## Industries", "", ...b.industries.map((i) => `- ${i}`), "");
    }

    if (b.differentiators.length > 0) {
      sections.push(
        "## Differentiators",
        "",
        ...b.differentiators.map((d) => `- ${d}`),
        "",
      );
    }

    if (b.customer_types.length > 0) {
      sections.push(
        "## Customer Types",
        "",
        ...b.customer_types.map((c) => `- ${c}`),
        "",
      );
    }

    return sections.join("\n");
  },
} as const;
