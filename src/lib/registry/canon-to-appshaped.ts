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
 */

import type {
  AppShapedCanon,
  CanonClaim,
  CanonCredentialClaim,
  EvidenceSupportLevel,
  TruthClaimStatus,
} from "./types";

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
// (e.g. "AI software / business intelligence platform") resolve to "technology" while profile.businessType
// keeps the full phrase — category and businessType are independent fields in entity-profile-v1.0.
const CATEGORY_KEYWORDS: Array<{ category: string; fragments: string[] }> = [
  { category: "technology", fragments: ["software", "saas", "business-intelligence", "analytics", "artificial-intelligence", "fintech", "technology", "cybersecurity"] },
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
  statement?: string;
  /** TruthClaimEvidence support levels for this claim (credential evidence gate). */
  evidence?: Array<{ supportLevel: EvidenceSupportLevel }>;
}

export interface CanonToAppShapedInput {
  version: number; // TruthCanonVersion.version (-> integer profileVersion source elsewhere)
  status: string; // canon status (APPROVED | PUBLISHED)
  approvedAt?: string | null;
  approvedBy?: string | null;
  businessName: string;
  primaryDomain: string; // caller resolves from websiteUrl (throws if absent)
  entitySlug: string; // caller computes via slugify(businessName)
  category?: string; // raw hint (officialBusinessType / first industry); mapped to enum
  lastVerified: string; // YYYY-MM-DD (caller supplies — keeps this pure/deterministic)
  dateAdded: string;
  lastUpdated: string;
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
  const locations: Array<{ name: string }> = [];
  const industries: string[] = [];
  const narrative: string[] = [];
  let businessType: string | undefined;
  const credentialClaims: CanonCredentialClaim[] = [];

  for (const c of input.claims) {
    if (CREDENTIAL_CATEGORIES.has(c.category)) {
      const v = asObject(c.value);
      credentialClaims.push({
        name: (typeof v.name === "string" && v.name) || c.statement || c.category,
        credentialType: c.category,
        issuingBody: typeof v.issuingBody === "string" ? v.issuingBody : undefined,
        status: c.status,
        evidence: (c.evidence ?? []).map((e) => ({ supportLevel: e.supportLevel })),
      });
      continue;
    }
    // public-profile facts: only VERIFIED claims cross (held facts are simply omitted)
    if (c.status !== "VERIFIED") continue;
    const v = asObject(c.value);
    switch (c.category) {
      case "service":
        if (typeof v.service === "string") services.push(v.service);
        break;
      case "location":
        if (typeof v.location === "string") locations.push({ name: v.location });
        break;
      case "industry":
        if (typeof v.industry === "string") industries.push(v.industry);
        break;
      case "business_type":
        if (typeof v.businessType === "string") businessType = v.businessType;
        break;
      case "description":
        if (typeof v.description === "string") narrative.push(v.description);
        break;
      case "differentiator":
        if (typeof v.differentiator === "string") narrative.push(v.differentiator);
        break;
      // customer_segment and any unmapped category -> no entity-profile-v1.0 field -> dropped
      default:
        break;
    }
  }

  const claims: CanonClaim[] = [];
  if (businessType) claims.push({ category: "identity", value: { businessType }, status: "VERIFIED" });
  if (services.length) claims.push({ category: "services", value: services, status: "VERIFIED" });
  if (locations.length) claims.push({ category: "locations", value: locations, status: "VERIFIED" });
  if (industries.length) claims.push({ category: "industries", value: industries, status: "VERIFIED" });
  if (narrative.length) claims.push({ category: "claims", value: narrative, status: "VERIFIED" });

  return {
    version: input.version,
    status: "APPROVED", // guard input for buildPublishDraft (canon is APPROVED/PUBLISHED)
    approvedAt: input.approvedAt ?? undefined,
    approvedBy: input.approvedBy ?? undefined,
    entity: {
      slug: input.entitySlug,
      legalName: input.businessName,
      commonName: input.businessName,
      primaryDomain: input.primaryDomain,
    },
    category: mapCategory(input.category ?? businessType ?? industries[0]),
    verification: {
      status: "claimed_verified",
      method: "customer-canon-approval",
      lastVerified: input.lastVerified,
      tier: "claimed_verified",
    },
    metadata: { dateAdded: input.dateAdded, lastUpdated: input.lastUpdated },
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
