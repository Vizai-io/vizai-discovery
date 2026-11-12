/**
 * @fileOverview Shared helpers for GR15 evidence file upload (WP-21C).
 *
 * Evidence FILES live in a private Supabase Storage bucket — never in the
 * repo or on the local filesystem as the durable store. The TruthClaim row
 * keeps only a pointer (`evidenceLocation`) plus the GR15 metadata fields;
 * the file itself is referenced from an EvidenceSource row (metadata holds
 * bucket + path) linked to the claim via TruthClaimEvidence.
 *
 * Serialization/validation of the fact itself lives in
 * `@/lib/truth/fact-serializer` (shared with the facts API); this module
 * only holds the Storage + evidence-type mapping concerns.
 *
 * Mapping (documented, do not change silently):
 * - TruthEvidenceType -> EvidenceSourceType:
 *     official_directory_listing   -> DIRECTORY
 *     government_registry_record   -> GOVERNMENT_RECORD
 *     membership_record            -> TRADE_ASSOCIATION
 *     certificate / renewal_notice / award_letter /
 *     customer_provided_document / other -> CUSTOMER_PROVIDED
 *   (There is no EvidenceSourceType for a bare certificate/award; the file
 *   is customer-provided material, so CUSTOMER_PROVIDED is the closest fit.)
 * - supportLevel rule: STRONG when the evidenceType is `certificate` or
 *   `government_registry_record` (authority-grade document kinds), MODERATE
 *   for every other evidenceType. The per-claim verification gate
 *   (claim-gates.ts) still decides whether that is enough to VERIFY.
 * - evidenceLocation format: `truth-evidence://<bucket-path>` where
 *   <bucket-path> is `<organizationId>/<companyProfileId>/<factId>/<timestamp>-<sanitized-filename>`.
 *   The `truth-evidence://` prefix names the bucket; strip it to get the
 *   Storage object path.
 */

import type {
  EvidenceSourceType,
  EvidenceSupportLevel,
  TruthEvidenceType,
} from "@prisma/client";

/** Private Supabase Storage bucket holding evidence files. Never public. */
export const EVIDENCE_BUCKET = "truth-evidence";

/** Max evidence file size: 10 MB (larger uploads are rejected with 413). */
export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;

export function mapEvidenceTypeToSourceType(
  evidenceType: TruthEvidenceType,
): EvidenceSourceType {
  switch (evidenceType) {
    case "official_directory_listing":
      return "DIRECTORY";
    case "government_registry_record":
      return "GOVERNMENT_RECORD";
    case "membership_record":
      return "TRADE_ASSOCIATION";
    case "certificate":
    case "renewal_notice":
    case "award_letter":
    case "customer_provided_document":
    case "other":
    default:
      return "CUSTOMER_PROVIDED";
  }
}

export function supportLevelForEvidenceType(
  evidenceType: TruthEvidenceType,
): EvidenceSupportLevel {
  return evidenceType === "certificate" ||
    evidenceType === "government_registry_record"
    ? "STRONG"
    : "MODERATE";
}

/** Strip directories / unsafe chars; keep the name short and Storage-safe. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "evidence";
  const clean = base
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return clean || "evidence";
}

/** Build the namespaced Storage object path for an evidence upload. */
export function buildEvidenceStoragePath(
  organizationId: string,
  companyProfileId: string,
  factId: string,
  fileName: string,
): string {
  return `${organizationId}/${companyProfileId}/${factId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

/** `truth-evidence://<path>` <-> Storage object path. */
export function evidenceLocationForPath(storagePath: string): string {
  return `${EVIDENCE_BUCKET}://${storagePath}`;
}

export function storagePathFromEvidenceLocation(
  evidenceLocation: string | null,
): string | null {
  if (!evidenceLocation) return null;
  const prefix = `${EVIDENCE_BUCKET}://`;
  return evidenceLocation.startsWith(prefix)
    ? evidenceLocation.slice(prefix.length)
    : evidenceLocation;
}
