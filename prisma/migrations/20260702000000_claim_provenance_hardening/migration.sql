-- WP-21B — Claim provenance & verification hardening (DEC-031..036).
-- ADDITIVE ONLY: one new enum, one new enum value, four TruthClaim columns,
-- three TruthClaimEvidence columns. No table/column drops, no type changes,
-- no data rewrites. Existing rows receive the column defaults
-- (origin = OBSERVED, publishAllowed = false); no existing verification
-- behaviour is wired to these fields yet (that is WP-21C).

-- DEC-032 — immutable provenance axis (separate from lifecycle status).
CREATE TYPE "ClaimOrigin" AS ENUM ('OBSERVED', 'DECLARED');

-- DEC-033 — owner attestation modelled as an evidence source type.
ALTER TYPE "EvidenceSourceType" ADD VALUE 'OWNER_ATTESTATION';

-- DEC-031/032/033/036 — per-claim provenance, verification anchor, and publish eligibility.
ALTER TABLE "truth_claims" ADD COLUMN     "origin" "ClaimOrigin" NOT NULL DEFAULT 'OBSERVED',
ADD COLUMN     "publishAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- DEC-034 — contradiction resolution audit fields.
ALTER TABLE "truth_claim_evidence" ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" TEXT;
