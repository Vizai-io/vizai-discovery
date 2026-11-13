/**
 * WP-19F — DB-row -> app-shaped Canon transformer (B+C convergence).
 *
 * Maps the B-lineage truth-infrastructure rows (TruthCanonVersion + TruthClaim +
 * TruthClaimEvidence) into the WP-19D `AppShapedCanon`, which `buildPublishDraft`
 * projects to a clean `entity-profile-v1.0` artifact + Beacon hash + 7 gates.
 *
 * PRIMARY SOURCE: TruthClaim rows (carry claim status + evidence; gateable).
 * FALLBACK/REFERENCE ONLY: TruthCanonVersion.canonPayload (resolved by the caller).
 *
 * Pure: no DB, no Prisma, no network. The caller (truth-infrastructure.service)
 * loads the rows and resolves identity/dates, then calls this.
 *
 * Parity contract (WP-19F): the registry profile is reproduced from the
 * TruthClaim rows — slug / commonName / dates / publication come from the
 * caller (stored CompanyProfile fields, canon/attestation dates, recorded
 * consent), never from today() or from slugifying the legal name.
 * `description` and `differentiator` rows have no registry-profile field and
 * are dropped; profile `claims` come only from category `claim` rows.
 */

import type {
  AppShapedCanon,
  CanonClaim,
  CanonCredentialClaim,
  EvidenceSupportLevel,
  TruthClaimStatus,
} from "./types";
import {
  isClaimPublishable,
  type ClaimOrigin,
  type EvidenceSourceType,
} from "../truth/claim-gates";

// TruthClaim categories that represent evidence-gated credentials (entity-profile-v1.0
// credentialType enum). Anything else is a public-profile fact.
const CREDENTIAL_CATEGORIES = new Set<string>([
  "certification", "award", "license", "regulated-credential", "security-designation",
  "compliance", "membership", "accreditation", "safety-quality-program",
  "partner-vendor-status", "recognition",
]);

const ENTITY_PROFILE_CATEGORY = new Set<string>([
  "technology", "professional-services", "financial", "healthcare", "manufacturing",
  "retail", "construction", "hospitality", "transportation", "logistics",
  "education", "real-estate", "other",
]);

// WP-19G-VIZAI-REVISE: when a businessType/industry string is not itself a category enum value,
// map it via conservative keyword fragments (substring match on the normalized value). The exact-enum
// check always wins; unmatched values still fall back to "other". This lets a descriptive businessType
// (e.g. "AI software / business intelligence platform") resolve to "technology", and
// "Third-party logistics (3PL), warehousing, fulfillment, distribution" resolve to "logistics",
// while profile.businessType keeps the full phrase — category and businessType are independent
// fields in entity-profile-v1.0.
const CATEGORY_KEYWORDS: Array<{ category: string; fragments: string[] }> = [
  { category: "technology", fragments: ["software", "saas", "business-intelligence", "analytics", "artificial-intelligence", "fintech", "technology", "cybersecurity"] },
  { category: "logistics", fragments: ["logistics", "3pl", "warehousing", "warehouse", "fulfillment", "distribution", "transportation", "freight", "trucking", "courier", "supply-chain"] },
];

function mapCategory(raw?: string): string {
  if (!raw) return "other";
  const norm = raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ENTITY_PROFILE_CATEGORY.has(norm)) return norm;
  for (const { category, fragments } of CATEGORY_KEYWORDS) {
    if (fragments.some((f) => norm.includes(f))) return category;
  }
  return "other";
}

// WP-19F parity: try each candidate IN ORDER through the keyword table and take
// the first that maps to a real category. A vague officialBusinessType that maps
// to "other" must not win by position over the businessType phrase (which the
// keyword table resolves to e.g. "logistics"); industries[0] is the last resort.
function mapCategoryFromCandidates(...candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    const mapped = mapCategory(c);
    if (mapped !== "other") return mapped;
  }
  return "other";
}

// Canadian province names by code, for location display names (below).
const PROVINCE_NAMES_BY_CODE: Record<string, string> = {
  ON: "Ontario",
  QC: "Quebec",
  BC: "British Columbia",
  AB: "Alberta",
  MB: "Manitoba",
  SK: "Saskatchewan",
  NS: "Nova Scotia",
  NB: "New Brunswick",
  PE: "Prince Edward Island",
  NL: "Newfoundland and Labrador",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};

/**
 * Bare city name for a location value. TruthClaim location values carry
 * "<City>, <Province>" (and, in the pre-parity rows, a trailing
 * " (headquarters)" role marker); the registry profile carries the bare city
 * in `name` with the province in `region` and the role in `role`, so both
 * suffixes are stripped here. "Smiths Falls, Ontario (headquarters)" and
 * "Smiths Falls, Ontario" both become "Smiths Falls".
 */
function locationDisplayName(raw: string, region?: string): string {
  let name = raw.trim();
  name = name.replace(/\s*\((headquarters|facility)\)\s*$/i, "").trim();
  const province = region ? PROVINCE_NAMES_BY_CODE[region.toUpperCase()] : undefined;
  const candidates = province ? [province] : Object.values(PROVINCE_NAMES_BY_CODE);
  for (const p of candidates) {
    const suffix = `, ${p}`;
    if (name.toLowerCase().endsWith(suffix.toLowerCase())) {
      name = name.slice(0, -suffix.length).trim();
      break;
    }
  }
  return name;
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A TruthClaim row reduced to what the transformer needs (PRIMARY source). */
export interface TransformerClaim {
  category: string;
  value: unknown; // TruthClaim.value (Json)
  status: TruthClaimStatus;
  origin?: ClaimOrigin;
  publishAllowed?: boolean;
  statement?: string;
  /** TruthClaimEvidence support levels for this claim (credential evidence gate). */
  evidence?: Array<{
    supportLevel: EvidenceSupportLevel;
    sourceType?: EvidenceSourceType;
    resolvedAt?: Date | string | null;
    resolvedBy?: string | null;
  }>;
}

export interface CanonToAppShapedInput {
  version: number; // TruthCanonVersion.version (-> integer profileVersion source elsewhere)
  status: string; // canon status (APPROVED | PUBLISHED)
  approvedAt?: string | null;
  approvedBy?: string | null;
  businessName: string;
  primaryDomain: string; // caller resolves from websiteUrl (throws if absent)
  entitySlug: string; // caller resolves: stored CompanyProfile.entitySlug, else slugified trading name
  /** Trading/common name (stored CompanyProfile.commonName, else legal-suffix strip). Defaults to businessName. */
  commonName?: string;
  category?: string; // raw hint (officialBusinessType / first industry); mapped to enum
  lastVerified: string; // YYYY-MM-DD — canon/attestation date from the caller, NEVER today()
  dateAdded: string; // YYYY-MM-DD — worksheet/canon-created date from the caller, NEVER today()
  lastUpdated: string; // YYYY-MM-DD — canon.updatedAt from the caller, NEVER today()
  /** Recorded registry consent (the caller throws without registryListingConsentAt). Omitted -> no publication emitted. */
  publication?: { status: "recorded" | "not-required-public-observation" };
  claims: TransformerClaim[]; // PRIMARY source
}

/**
 * Project B-lineage rows to an AppShapedCanon. Non-credential VERIFIED claims are
 * aggregated by category into the public profile; credential-category claims are
 * forwarded (with evidence) to the WP-19D evidence gate, which holds/excludes any
 * that are not VERIFIED + STRONG — by absence, never as a negative claim.
 */
export function canonToAppShaped(input: CanonToAppShapedInput): AppShapedCanon {
  const services: string[] = [];
  const locations: Array<{ name: string; region?: string; role?: string }> = [];
  const industries: string[] = [];
  // Registry profile `claims` come ONLY from category `claim` rows (value { claim }).
  // `description` and `differentiator` rows have no registry-profile field and are
  // dropped here (they remain in the canonical truth and the AI-native profile).
  const publicClaims: string[] = [];
  // `business_type` + `identity` rows merge into the single `identity` claim the
  // second-stage mapper routes via PROFILE_SCALAR_KEYS.
  const identityParts: Record<string, unknown> = {};
  let businessType: string | undefined;
  let scaleValue: Record<string, unknown> | undefined;
  let contactValue: Record<string, unknown> | undefined;
  let profilesValue: Record<string, unknown> | undefined;
  const credentialClaims: CanonCredentialClaim[] = [];

  for (const c of input.claims) {
    const publishable = isClaimPublishable(
      {
        ...c,
        origin: c.origin ?? "OBSERVED",
        publishAllowed: c.publishAllowed ?? c.status === "VERIFIED",
      },
      (c.evidence ?? []).map((e) => ({
        ...e,
        sourceType: e.sourceType ?? "WEBSITE",
      })),
      true,
    );
    if (CREDENTIAL_CATEGORIES.has(c.category)) {
      const v = asObject(c.value);
      credentialClaims.push({
        name: (typeof v.name === "string" && v.name) || c.statement || c.category,
        credentialType: c.category,
        issuingBody: typeof v.issuingBody === "string" ? v.issuingBody : undefined,
        status: publishable ? "VERIFIED" : "NEEDS_EVIDENCE",
        evidence: (c.evidence ?? []).map((e) => ({ supportLevel: e.supportLevel })),
      });
      continue;
    }
    // Public facts cross only after verification, per-claim publication approval,
    // evidence revalidation, and entity-level registry consent.
    if (!publishable) continue;
    const v = asObject(c.value);
    switch (c.category) {
      case "service":
        if (typeof v.service === "string") services.push(v.service);
        break;
      case "location": {
        if (typeof v.location === "string") {
          const region = typeof v.region === "string" ? v.region : undefined;
          const role = typeof v.role === "string" ? v.role : undefined;
          const loc: { name: string; region?: string; role?: string } = {
            name: locationDisplayName(v.location, region),
          };
          if (region) loc.region = region;
          if (role) loc.role = role;
          locations.push(loc);
        }
        break;
      }
      case "industry":
        if (typeof v.industry === "string") industries.push(v.industry);
        break;
      case "business_type":
        if (typeof v.businessType === "string") {
          businessType = v.businessType;
          identityParts.businessType = v.businessType;
        }
        break;
      case "identity":
        for (const k of ["country", "yearFounded", "ownership"] as const) {
          if (k in v) identityParts[k] = v[k];
        }
        break;
      case "scale":
        scaleValue = { ...scaleValue, ...v };
        break;
      case "contact":
        contactValue = { ...contactValue, ...v };
        break;
      case "profiles":
        profilesValue = { ...profilesValue, ...v };
        break;
      case "claim": {
        const s =
          typeof v.claim === "string"
            ? v.claim
            : typeof c.value === "string"
              ? c.value
              : undefined;
        if (s) publicClaims.push(s);
        break;
      }
      // description, differentiator, customer_segment and any unmapped category
      // have no entity-profile-v1.0 field -> dropped (never merged into claims).
      default:
        break;
    }
  }

  const claims: CanonClaim[] = [];
  if (Object.keys(identityParts).length > 0) {
    claims.push({ category: "identity", value: identityParts, status: "VERIFIED" });
  }
  if (scaleValue) claims.push({ category: "scale", value: scaleValue, status: "VERIFIED" });
  if (locations.length) claims.push({ category: "locations", value: locations, status: "VERIFIED" });
  if (services.length) claims.push({ category: "services", value: services, status: "VERIFIED" });
  if (industries.length) claims.push({ category: "industries", value: industries, status: "VERIFIED" });
  if (publicClaims.length) claims.push({ category: "claims", value: publicClaims, status: "VERIFIED" });
  if (contactValue) claims.push({ category: "contact", value: contactValue, status: "VERIFIED" });
  if (profilesValue) claims.push({ category: "profiles", value: profilesValue, status: "VERIFIED" });

  // `publication` is emitted only when the caller passes recorded consent
  // (loadCanonForArtifact throws without registryListingConsentAt); without it
  // the artifact fails the registry schema, which requires publication.
  const publication = input.publication
    ? {
        policyVersion: "1.0" as const,
        consentReceipt: {
          status: input.publication.status,
          reference: `canon:${input.entitySlug}:${input.version}.0`,
        },
      }
    : undefined;

  return {
    version: input.version,
    status: "APPROVED", // guard input for buildPublishDraft (canon is APPROVED/PUBLISHED)
    approvedAt: input.approvedAt ?? undefined,
    approvedBy: input.approvedBy ?? undefined,
    entity: {
      slug: input.entitySlug,
      legalName: input.businessName,
      commonName: input.commonName ?? input.businessName,
      primaryDomain: input.primaryDomain,
    },
    category: mapCategoryFromCandidates(input.category, businessType, industries[0]),
    verification: {
      status: "claimed_verified",
      method: "customer-canon-approval",
      lastVerified: input.lastVerified,
    },
    metadata: { dateAdded: input.dateAdded, lastUpdated: input.lastUpdated },
    ...(publication ? { publication } : {}),
    claims,
    credentialClaims,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence-plan shaper — computes the RegistryProfile (READY) + TruthPublishRecord
// (DRAFT) writes from a publish packet. Pure (no DB) so the write behavior is testable.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal structural view of a WP-19D DraftPublishPacket (avoids a service-layer import). */
export interface DraftPacketLike {
  entitySlug: string;
  generatedArtifact: unknown;
  contentHash: string;
}

export interface RegistryDraftWrites {
  registryProfile: {
    where: { organizationId_registryId: { organizationId: string; registryId: string } };
    create: {
      organizationId: string;
      companyProfileId: string;
      canonVersionId: string;
      registryId: string;
      status: "READY";
      payload: unknown;
      payloadHash: string;
    };
    update: { canonVersionId: string; status: "READY"; payload: unknown; payloadHash: string };
  };
  truthPublishRecord: {
    where: { companyProfileId_version: { companyProfileId: string; version: number } };
    create: {
      organizationId: string;
      companyProfileId: string;
      version: number;
      status: "DRAFT";
      exportPayload: unknown;
      payloadHash: string;
      notes: string;
    };
    update: { status: "DRAFT"; exportPayload: unknown; payloadHash: string };
  };
}

export function buildRegistryDraftWrites(args: {
  organizationId: string;
  companyProfileId: string;
  canonVersionId: string;
  version: number; // = TruthPublishRecord.version = integer profileVersion
  packet: DraftPacketLike;
  approvedBy?: string;
}): RegistryDraftWrites {
  const { organizationId, companyProfileId, canonVersionId, version, packet, approvedBy } = args;
  const registryId = packet.entitySlug;
  const payload = packet.generatedArtifact;
  const payloadHash = packet.contentHash;
  const notes = approvedBy
    ? `WP-19F public-registry candidate (READY), approved by ${approvedBy}; not externally published.`
    : "WP-19F public-registry candidate (READY); not externally published.";
  return {
    registryProfile: {
      where: { organizationId_registryId: { organizationId, registryId } },
      create: { organizationId, companyProfileId, canonVersionId, registryId, status: "READY", payload, payloadHash },
      update: { canonVersionId, status: "READY", payload, payloadHash },
    },
    truthPublishRecord: {
      where: { companyProfileId_version: { companyProfileId, version } },
      create: {
        organizationId,
        companyProfileId,
        version,
        status: "DRAFT",
        exportPayload: packet,
        payloadHash,
        notes,
      },
      update: { status: "DRAFT", exportPayload: packet, payloadHash },
    },
  };
}

/**
 * Pure approve-gate. Throws unless the prepared packet passed all technical gates
 * (and, if a reviewed hash is supplied, still matches it — guards against the canon
 * changing between prepare and approve). The approve/persist phase calls this BEFORE
 * any DB write, so a gate failure blocks the write.
 */
export function assertApprovable(
  packet: { technicalPass: boolean; contentHash: string; gateResults: Array<{ gate: string; status: string; detail: string }> },
  expectedContentHash?: string,
): void {
  if (!packet.technicalPass) {
    const fails = packet.gateResults.filter((g) => g.status === "FAIL").map((g) => `${g.gate}: ${g.detail}`).join("; ");
    throw new Error(`Publish gates failed — not persisting: ${fails}`);
  }
  if (expectedContentHash && expectedContentHash !== packet.contentHash) {
    throw new Error("contentHash drift since review — re-prepare before approving.");
  }
}
