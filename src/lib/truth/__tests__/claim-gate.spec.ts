import assert from "node:assert/strict";
import { canVerifyClaim, isClaimPublishable } from "../claim-gates";

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

console.log("claim gate: 10 passed, 0 failed");
