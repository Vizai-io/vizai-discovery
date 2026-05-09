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

/**
 * Build a normalized, deterministic CanonicalBusiness from CompanyProfile fields.
 * Called by CanonicalTruthService — not directly.
 */
export function buildCanonicalBusiness(profile: {
  businessName: string;
  websiteUrl: string | null;
  officialDescription: string | null;
  officialBusinessType: string | null;
  officialServices: string[];
  officialLocations: string[];
  officialIndustries: string[];
  officialDifferentiators: string[];
  officialCustomerTypes: string[];
}): CanonicalBusiness {
  return {
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
