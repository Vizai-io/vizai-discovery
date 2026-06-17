/**
 * WP-19D — Publish-boundary types (in-app port of the WP-19B prototype).
 *
 * App-shaped Canon input mirrors the real Prisma models (TruthCanonVersion,
 * TruthEntity, TruthClaim, TruthClaimEvidence) WITHOUT importing Prisma — these
 * are plain shapes so the boundary stays a pure, DB-free, fixture-driven service.
 *
 * The output `EntityProfile` is the clean public artifact (entity-profile-v1.0,
 * Model C / DEC-029): a public-safe SUBSET of the private Canon, never the Canon.
 */

export type TruthClaimStatus = "DRAFT" | "VERIFIED" | "NEEDS_EVIDENCE" | "REJECTED" | "ARCHIVED";
export type EvidenceSupportLevel = "STRONG" | "MODERATE" | "WEAK" | "CONTRADICTS";

/** One TruthClaim (non-credential). `value` is the structured public fact (TruthClaim.value Json). */
export interface CanonClaim {
  category: string; // routes to a public profile field (scale/locations/services/...)
  statement?: string;
  value: unknown;
  status: TruthClaimStatus;
}

/** One TruthClaimEvidence link (only its support level matters here; the evidence itself never crosses). */
export interface CanonEvidence {
  supportLevel: EvidenceSupportLevel;
  sourceType?: string;
}

/** A credential-category TruthClaim with its evidence links (cert/award/membership/...). */
export interface CanonCredentialClaim {
  name: string;
  credentialType: string;
  issuingBody?: string;
  issueDate?: string;
  expiryOrRenewalDate?: string;
  status: TruthClaimStatus;
  evidence: CanonEvidence[];
}

/** App-shaped approved Canon (resembles TruthCanonVersion + relations). Fixture-only; no DB. */
export interface AppShapedCanon {
  version: number; // TruthCanonVersion.version (Int)
  status: string; // expect "APPROVED" — only approved Canons may be prepared
  approvedAt?: string;
  approvedBy?: string;
  entity: {
    slug: string;
    legalName: string;
    commonName: string;
    primaryDomain: string;
    aliases?: string[];
  };
  category: string;
  verification: {
    status: string;
    method: string;
    lastVerified: string;
    tier?: string;
    customerApprovalDate?: string;
  };
  metadata: { dateAdded: string; lastUpdated: string };
  claims: CanonClaim[];
  credentialClaims: CanonCredentialClaim[];
  /** Internal/private block — proves the boundary strips it; NEVER crosses. */
  private?: Record<string, unknown>;
}

/** Clean public artifact (entity-profile-v1.0 subset this service emits). */
export interface EntityProfile {
  schemaVersion: "1.0";
  entitySlug: string;
  businessIdentifier: {
    legalName: string;
    commonName: string;
    primaryDomain: string;
    aliases?: string[];
  };
  category: string;
  verification: {
    status: string;
    method: string;
    lastVerified: string;
    tier?: string;
    canonVersion?: string;
    customerApprovalDate?: string;
  };
  profile?: Record<string, unknown>;
  credentials?: Array<Record<string, unknown>>;
  metadata: { dateAdded: string; lastUpdated: string };
  /** Integer per DEC-030 gate 4 (mapped to TruthPublishRecord.version). Omitted in V1 — see service. */
  profileVersion?: number;
}

export interface ExcludedClaim {
  name: string;
  credentialType?: string;
  status: string;
  reason: string;
}

export interface GateResult {
  gate: string;
  status: "PASS" | "FAIL" | "PENDING" | "PREVIEW";
  detail: string;
}
