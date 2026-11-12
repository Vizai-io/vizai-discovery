/**
 * @fileOverview Shared serializer + validation helpers for the facts API
 * (WP-21C Truth Canon model alignment).
 *
 * The platform API returns snake_case fields; the Prisma model uses camelCase.
 * `serializeFact` maps one TruthClaim row to its API shape. The enum lists
 * mirror the Prisma schema so routes can validate query/body values with a 400
 * instead of letting Prisma throw a 500.
 */

import type {
  ClaimOrigin,
  TruthClaim,
  TruthClaimStatus,
  TruthEvidenceStatus,
  TruthEvidenceType,
  TruthType,
  TruthVerificationState,
} from "@prisma/client";

export const TRUTH_TYPES: readonly TruthType[] = ["OBSERVED", "DECLARED", "VERIFIED"];
export const VERIFICATION_STATES: readonly TruthVerificationState[] = [
  "PENDING",
  "CONFIRMED",
  "EDITED",
  "REMOVED",
  "UNSURE",
];
export const CLAIM_STATUSES: readonly TruthClaimStatus[] = [
  "DRAFT",
  "NEEDS_EVIDENCE",
  "VERIFIED",
  "REJECTED",
  "ARCHIVED",
];
export const CLAIM_ORIGINS: readonly ClaimOrigin[] = ["OBSERVED", "DECLARED"];
export const EVIDENCE_STATUSES: readonly TruthEvidenceStatus[] = [
  "no_evidence_provided",
  "evidence_requested",
  "evidence_received",
  "evidence_verified",
  "expired_or_stale",
  "do_not_publish",
];
export const EVIDENCE_TYPES: readonly TruthEvidenceType[] = [
  "certificate",
  "renewal_notice",
  "award_letter",
  "official_directory_listing",
  "membership_record",
  "government_registry_record",
  "customer_provided_document",
  "other",
];

/** API shape for one fact — snake_case, mirroring the Prisma TruthClaim row. */
export interface FactApiShape {
  id: string;
  company_profile_id: string;
  category: string;
  key: string | null;
  statement: string;
  value: unknown;
  truth_type: TruthType;
  verification_state: TruthVerificationState;
  status: TruthClaimStatus;
  origin: ClaimOrigin;
  confidence: number;
  source_url: string | null;
  source_date: string | null;
  declared_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  evidence_required: boolean;
  evidence_status: TruthEvidenceStatus;
  evidence_type: TruthEvidenceType | null;
  issuing_body: string | null;
  issue_date: string | null;
  expiry_or_renewal_date: string | null;
  evidence_location: string | null;
  public_publish_allowed: boolean;
  canon_version_number: number | null;
  created_at: string;
  updated_at: string;
}

export function serializeFact(claim: TruthClaim): FactApiShape {
  return {
    id: claim.id,
    company_profile_id: claim.companyProfileId,
    category: claim.category,
    key: claim.key,
    statement: claim.statement,
    value: claim.value,
    truth_type: claim.truthType,
    verification_state: claim.verificationState,
    status: claim.status,
    origin: claim.origin,
    confidence: claim.confidence,
    source_url: claim.sourceUrl,
    source_date: claim.sourceDate ? claim.sourceDate.toISOString() : null,
    declared_by: claim.declaredBy,
    verified_at: claim.verifiedAt ? claim.verifiedAt.toISOString() : null,
    verified_by: claim.verifiedBy,
    evidence_required: claim.evidenceRequired,
    evidence_status: claim.evidenceStatus,
    evidence_type: claim.evidenceType,
    issuing_body: claim.issuingBody,
    issue_date: claim.issueDate ? claim.issueDate.toISOString() : null,
    expiry_or_renewal_date: claim.expiryOrRenewalDate ? claim.expiryOrRenewalDate.toISOString() : null,
    evidence_location: claim.evidenceLocation,
    public_publish_allowed: claim.publishAllowed,
    canon_version_number: claim.canonVersionNumber,
    created_at: claim.createdAt.toISOString(),
    updated_at: claim.updatedAt.toISOString(),
  };
}

/**
 * Parse an optional ISO date string from a request body. Returns `undefined`
 * when the field was omitted, `null` when explicitly null (clear the column),
 * or a Date. Throws an Error with a client-facing message on invalid input.
 */
export function parseOptionalDate(raw: unknown, field: string): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`${field} must be an ISO date string or null`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid ISO date string`);
  }
  return parsed;
}

/** Count occurrences of one key across serialized facts (for the `counts` object). */
export function countByKey<T>(items: T[], key: keyof T): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = String(item[key]);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
