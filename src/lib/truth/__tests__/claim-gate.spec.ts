import assert from "node:assert/strict";
import { canVerifyClaim, isClaimPublishable, canApproveCanon } from "../claim-gates";

const observed = {
  category: "service",
  origin: "OBSERVED" as const,
  status: "DRAFT" as const,
  publishAllowed: false,
};
const declared = { ...observed, origin: "DECLARED" as const };
const credential = { ...declared, category: "certification" };

const strongWebsite = { supportLevel: "STRONG" as const, sourceType: "WEBSITE" as const };
const moderateWebsite = { supportLevel: "MODERATE" as const, sourceType: "WEBSITE" as const };
const strongAttestation = {
  supportLevel: "STRONG" as const,
  sourceType: "OWNER_ATTESTATION" as const,
};
const unresolvedContradiction = {
  supportLevel: "CONTRADICTS" as const,
  sourceType: "REVIEW_PLATFORM" as const,
};

assert.equal(canVerifyClaim(observed, [strongWebsite]).ok, true);
assert.equal(canVerifyClaim(observed, [moderateWebsite]).ok, false);
assert.equal(canVerifyClaim(observed, [strongWebsite, unresolvedContradiction]).ok, false);
assert.equal(canVerifyClaim(declared, [strongAttestation]).ok, true);
assert.equal(canVerifyClaim(declared, [strongWebsite]).ok, false);
assert.equal(canVerifyClaim(credential, [strongAttestation]).ok, false);
assert.equal(canVerifyClaim(credential, [strongWebsite]).ok, true);
assert.equal(
  isClaimPublishable(
    { ...observed, status: "VERIFIED", publishAllowed: true },
    [strongWebsite],
    true,
  ),
  true,
);
assert.equal(
  isClaimPublishable(
    { ...observed, status: "VERIFIED", publishAllowed: false },
    [strongWebsite],
    true,
  ),
  false,
);
assert.equal(
  isClaimPublishable(
    { ...observed, status: "VERIFIED", publishAllowed: true },
    [strongWebsite],
    false,
  ),
  false,
);

// ── canon-approval gate (WP-21C, DEC-031/034) ────────────────────────────────
const resolvedContradiction = {
  ...unresolvedContradiction,
  resolvedAt: new Date(),
  resolvedBy: "operator",
};
assert.equal(canApproveCanon([{ status: "VERIFIED", evidence: [strongWebsite] }]).ok, true);
assert.equal(canApproveCanon([{ status: "NEEDS_EVIDENCE", evidence: [] }]).ok, true); // held by absence — allowed
assert.equal(canApproveCanon([{ status: "REJECTED", evidence: [] }]).ok, true);
assert.equal(canApproveCanon([{ status: "DRAFT", evidence: [] }]).ok, false); // untriaged draft blocks
assert.equal(
  canApproveCanon([{ status: "VERIFIED", evidence: [strongWebsite, unresolvedContradiction] }]).ok,
  false,
); // unresolved contradiction blocks
assert.equal(
  canApproveCanon([{ status: "VERIFIED", evidence: [strongWebsite, resolvedContradiction] }]).ok,
  true,
); // resolved contradiction is allowed

console.log("claim gate: 16 passed, 0 failed");
