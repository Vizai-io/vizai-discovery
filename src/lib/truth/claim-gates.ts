export type ClaimOrigin = "OBSERVED" | "DECLARED";
export type EvidenceSourceType =
  | "WEBSITE"
  | "SOCIAL_PROFILE"
  | "GOVERNMENT_RECORD"
  | "TRADE_ASSOCIATION"
  | "DIRECTORY"
  | "PRESS"
  | "REVIEW_PLATFORM"
  | "OWNER_ATTESTATION"
  | "CUSTOMER_PROVIDED"
  | "OTHER";
export type EvidenceSupportLevel =
  | "STRONG"
  | "MODERATE"
  | "WEAK"
  | "CONTRADICTS";
export type TruthClaimStatus =
  | "DRAFT"
  | "NEEDS_EVIDENCE"
  | "VERIFIED"
  | "REJECTED"
  | "ARCHIVED";

const CREDENTIAL_CATEGORIES = new Set([
  "certification",
  "license",
  "membership",
  "accreditation",
  "award",
  "regulated-credential",
  "compliance",
  "security-designation",
  "safety-quality-program",
  "partner-vendor-status",
  "recognition",
]);

const OBSERVED_STRONG_SOURCES = new Set<EvidenceSourceType>([
  "WEBSITE",
  "GOVERNMENT_RECORD",
  "TRADE_ASSOCIATION",
  "DIRECTORY",
  "PRESS",
  "REVIEW_PLATFORM",
  "CUSTOMER_PROVIDED",
]);

const AUTHORITY_GRADE_SOURCES = new Set<EvidenceSourceType>([
  "GOVERNMENT_RECORD",
  "TRADE_ASSOCIATION",
  "WEBSITE",
]);

export interface ClaimGateInput {
  category: string;
  origin: ClaimOrigin;
  status: TruthClaimStatus;
  publishAllowed: boolean;
}

export interface ClaimEvidenceInput {
  supportLevel: EvidenceSupportLevel;
  sourceType: EvidenceSourceType;
  resolvedAt?: Date | string | null;
  resolvedBy?: string | null;
}

function hasUnresolvedContradiction(evidence: ClaimEvidenceInput[]): boolean {
  return evidence.some((link) =>
    link.supportLevel === "CONTRADICTS" &&
    !(link.resolvedAt && link.resolvedBy),
  );
}

export function canVerifyClaim(
  claim: ClaimGateInput,
  evidence: ClaimEvidenceInput[],
): { ok: boolean; reason: string } {
  if (claim.status === "REJECTED" || claim.status === "ARCHIVED") {
    return { ok: false, reason: "Rejected or archived claims require a new draft." };
  }
  if (hasUnresolvedContradiction(evidence)) {
    return { ok: false, reason: "An unresolved contradictory source blocks verification." };
  }

  const strong = evidence.filter((link) => link.supportLevel === "STRONG");
  if (CREDENTIAL_CATEGORIES.has(claim.category)) {
    return strong.some((link) => AUTHORITY_GRADE_SOURCES.has(link.sourceType))
      ? { ok: true, reason: "Credential has strong authority-grade evidence." }
      : { ok: false, reason: "Credential requires strong authority-grade evidence." };
  }
  if (claim.origin === "DECLARED") {
    return strong.some((link) => link.sourceType === "OWNER_ATTESTATION")
      ? { ok: true, reason: "Declared claim has strong owner attestation." }
      : { ok: false, reason: "Declared claim requires strong owner attestation." };
  }
  return strong.some((link) => OBSERVED_STRONG_SOURCES.has(link.sourceType))
    ? { ok: true, reason: "Observed claim has strong independent evidence." }
    : { ok: false, reason: "Observed claim requires strong independent evidence." };
}

export function isClaimPublishable(
  claim: ClaimGateInput,
  evidence: ClaimEvidenceInput[],
  registryListingConsent: boolean,
): boolean {
  return registryListingConsent &&
    claim.status === "VERIFIED" &&
    claim.publishAllowed &&
    canVerifyClaim(claim, evidence).ok;
}

export interface CanonClaimGateInput {
  status: TruthClaimStatus;
  evidence: ClaimEvidenceInput[];
}

/**
 * Canon-approval gate (WP-21C, DEC-031/034). A Canon may be APPROVED only when every
 * claim is triaged (no untriaged DRAFT) and no claim carries an unresolved contradictory
 * source. NEEDS_EVIDENCE / REJECTED / ARCHIVED claims are allowed — they are simply held
 * (excluded from the public artifact by absence), never turned into negative claims.
 */
export function canApproveCanon(
  claims: CanonClaimGateInput[],
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const contradicted = claims.filter((c) => hasUnresolvedContradiction(c.evidence)).length;
  const draft = claims.filter((c) => c.status === "DRAFT").length;
  if (contradicted > 0) {
    reasons.push(`${contradicted} claim(s) have an unresolved contradictory source — resolve or reject before approval.`);
  }
  if (draft > 0) {
    reasons.push(`${draft} claim(s) are still DRAFT — verify, reject, or archive before approval.`);
  }
  return { ok: reasons.length === 0, reasons };
}
