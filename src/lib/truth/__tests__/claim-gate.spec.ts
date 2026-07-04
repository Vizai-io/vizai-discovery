/**
 * WP-21D-A — Pre-gate SPEC HARNESS for claim provenance / verification (DEC-031..034/036).
 *
 * This file is a TEST-ONLY executable contract that DEFINES the behavior WP-21C must implement in the
 * production server gate (a future `claim-gates.ts`). The reference logic below is NOT production code
 * and is imported by nothing in the app. It is pure (no DB, no Prisma, no network) and runs under the
 * existing ts-node runner:
 *
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *     src/lib/truth/__tests__/claim-gate.spec.ts
 *
 * Status: all assertions PASS against the reference spec — they encode the intended WP-21C rules. The
 * CURRENT production blanket rule (truth-infrastructure.service.ts:412) is deliberately NOT exercised
 * here and is unchanged; the contrast test (T-BLANKET) documents the rule WP-21C replaces.
 */

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// ── Reference types (mirror WP-21B schema shapes; test-only) ──────────────────
type Origin = "OBSERVED" | "DECLARED";
type Status = "DRAFT" | "NEEDS_EVIDENCE" | "VERIFIED" | "REJECTED" | "ARCHIVED";
type SupportLevel = "STRONG" | "MODERATE" | "WEAK" | "CONTRADICTS";
type SourceType =
  | "WEBSITE" | "SOCIAL_PROFILE" | "DIRECTORY" | "GOVERNMENT_RECORD" | "TRADE_ASSOCIATION"
  | "REVIEW_PLATFORM" | "PRESS" | "CUSTOMER_PROVIDED" | "OWNER_ATTESTATION" | "OTHER";

interface Link { supportLevel: SupportLevel; sourceType: SourceType; resolvedAt?: string | null; resolvedBy?: string | null; resolutionNote?: string | null; }
interface Claim { category: string; statement: string; value: unknown; origin: Origin; status: Status; }

// ── Reference gate spec (DEC-031..034) — the contract for WP-21C ──────────────
const CREDENTIAL_CATEGORIES = new Set<string>([
  "certification", "license", "membership", "accreditation", "award", "regulated-credential",
  "compliance", "security-designation", "safety-quality-program", "partner-vendor-status", "recognition",
]);
// STRONG sources that satisfy an OBSERVED claim (independent of the customer). Excludes OWNER_ATTESTATION.
const OBSERVED_STRONG_SOURCES = new Set<SourceType>([
  "WEBSITE", "GOVERNMENT_RECORD", "TRADE_ASSOCIATION", "DIRECTORY", "PRESS", "REVIEW_PLATFORM", "CUSTOMER_PROVIDED",
]);
// Authority-grade sources for credentials (DEC-031.2). Attestation is never authority-grade.
const AUTHORITY_GRADE = new Set<SourceType>(["GOVERNMENT_RECORD", "TRADE_ASSOCIATION", "WEBSITE"]);

/** DEC-034: an unresolved CONTRADICTS link blocks verification. Resolution requires resolvedAt + resolvedBy. */
function contradictionBlocks(l: Link): boolean {
  return l.supportLevel === "CONTRADICTS" && !(l.resolvedAt && l.resolvedBy);
}

/** DEC-031: can this claim transition to VERIFIED given its evidence links? Pure, deterministic. */
function canVerify(claim: Claim, links: Link[]): { ok: boolean; reason: string } {
  if (claim.status === "REJECTED" || claim.status === "ARCHIVED")
    return { ok: false, reason: "REJECTED/ARCHIVED cannot verify; requires a new DRAFT/new claim" };
  if (links.some(contradictionBlocks))
    return { ok: false, reason: "unresolved CONTRADICTS blocks verification" };
  const strong = links.filter((l) => l.supportLevel === "STRONG");
  if (CREDENTIAL_CATEGORIES.has(claim.category)) {
    const authorityStrong = strong.some((l) => AUTHORITY_GRADE.has(l.sourceType));
    return authorityStrong
      ? { ok: true, reason: "credential: STRONG authority-grade source" }
      : { ok: false, reason: "credential requires STRONG authority-grade source; attestation insufficient" };
  }
  if (claim.origin === "DECLARED") {
    const attestationStrong = strong.some((l) => l.sourceType === "OWNER_ATTESTATION");
    return attestationStrong
      ? { ok: true, reason: "declared: STRONG owner attestation" }
      : { ok: false, reason: "declared requires a STRONG OWNER_ATTESTATION" };
  }
  const observedStrong = strong.some((l) => OBSERVED_STRONG_SOURCES.has(l.sourceType));
  return observedStrong
    ? { ok: true, reason: "observed: STRONG non-attestation source" }
    : { ok: false, reason: "observed requires a STRONG non-attestation source" };
}

/** DEC-031/033/036: publishable = VERIFIED AND publishAllowed AND entity registry-listing consent. */
function isPublishable(c: { status: Status; publishAllowed: boolean }, opts: { consent: boolean }): boolean {
  return c.status === "VERIFIED" && c.publishAllowed === true && opts.consent === true;
}

/** DEC-031 inheritance valve: identical category+statement+value carries verification forward; else fresh DRAFT. */
function sameFact(a: Claim, b: Claim): boolean {
  return a.category === b.category && a.statement === b.statement && JSON.stringify(a.value) === JSON.stringify(b.value);
}
function inherit(prev: Claim, prevLinks: Link[], next: Claim): { status: Status; verifiedAt: string | null; links: Link[] } {
  if (prev.status === "VERIFIED" && sameFact(prev, next))
    return { status: "VERIFIED", verifiedAt: "carried", links: [...prevLinks] }; // links copied intentionally
  return { status: "DRAFT", verifiedAt: null, links: [] }; // changed fact -> re-link + re-verify
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const strongWebsite: Link = { supportLevel: "STRONG", sourceType: "WEBSITE" };
const moderateWebsite: Link = { supportLevel: "MODERATE", sourceType: "WEBSITE" };
const strongAttestation: Link = { supportLevel: "STRONG", sourceType: "OWNER_ATTESTATION" };
const strongGov: Link = { supportLevel: "STRONG", sourceType: "GOVERNMENT_RECORD" };
const unresolvedContradicts: Link = { supportLevel: "CONTRADICTS", sourceType: "REVIEW_PLATFORM", resolvedAt: null, resolvedBy: null };
const resolvedContradicts: Link = { supportLevel: "CONTRADICTS", sourceType: "REVIEW_PLATFORM", resolvedAt: "2026-07-02", resolvedBy: "op_1", resolutionNote: "source outdated; superseded" };
const noteOnlyContradicts: Link = { supportLevel: "CONTRADICTS", sourceType: "REVIEW_PLATFORM", resolvedAt: null, resolvedBy: null, resolutionNote: "looked into it" };

const observed: Claim = { category: "service", statement: "provides warehousing", value: { service: "Warehousing" }, origin: "OBSERVED", status: "DRAFT" };
const declared: Claim = { category: "service", statement: "provides fulfillment", value: { service: "Fulfillment" }, origin: "DECLARED", status: "DRAFT" };
const credential: Claim = { category: "certification", statement: "SQF certified", value: { name: "SQF" }, origin: "DECLARED", status: "DRAFT" };

console.log("== Area 1 — per-claim verification gate ==");
check("T1 OBSERVED + STRONG website + no contradiction -> can verify", canVerify(observed, [strongWebsite]).ok);
check("T2 OBSERVED + MODERATE only -> cannot verify", !canVerify(observed, [moderateWebsite]).ok);
check("T3 OBSERVED + STRONG + unresolved CONTRADICTS -> cannot verify", !canVerify(observed, [strongWebsite, unresolvedContradicts]).ok);
check("T4 OBSERVED + STRONG + resolved CONTRADICTS -> can verify", canVerify(observed, [strongWebsite, resolvedContradicts]).ok);
check("T5 DECLARED + STRONG OWNER_ATTESTATION -> can verify", canVerify(declared, [strongAttestation]).ok);
check("T6 DECLARED without attestation (STRONG website only) -> cannot verify", !canVerify(declared, [strongWebsite]).ok);
check("T7 credential + attestation only -> cannot verify", !canVerify(credential, [strongAttestation]).ok);
check("T7b credential + STRONG GOVERNMENT_RECORD -> can verify", canVerify(credential, [strongGov]).ok);
check("T8 REJECTED claim cannot verify", !canVerify({ ...observed, status: "REJECTED" }, [strongWebsite]).ok);
check("T8b ARCHIVED claim cannot verify", !canVerify({ ...observed, status: "ARCHIVED" }, [strongWebsite]).ok);
// Contrast with the CURRENT blanket rule (documentation of what WP-21C replaces; production unchanged):
check("T-BLANKET spec gate does NOT verify on 1 MODERATE evidence (blanket rule would)", !canVerify(observed, [moderateWebsite]).ok);

console.log("== Area 2 — publish eligibility (publishAllowed) ==");
check("T9 default publishAllowed=false -> not publishable even if VERIFIED + consent", !isPublishable({ status: "VERIFIED", publishAllowed: false }, { consent: true }));
check("T10 VERIFIED + publishAllowed=true but NO consent -> not publishable", !isPublishable({ status: "VERIFIED", publishAllowed: true }, { consent: false }));
check("T11 VERIFIED + publishAllowed=true + consent -> publishable", isPublishable({ status: "VERIFIED", publishAllowed: true }, { consent: true }));
check("T12 non-VERIFIED never publishable", !isPublishable({ status: "NEEDS_EVIDENCE", publishAllowed: true }, { consent: true }));
// Held = excluded by absence only (no negation): selecting publishable claims drops held ones entirely.
const mixed = [
  { id: "a", status: "VERIFIED" as Status, publishAllowed: true },
  { id: "b", status: "VERIFIED" as Status, publishAllowed: false }, // held (consented profile, but claim not publish-allowed)
  { id: "c", status: "NEEDS_EVIDENCE" as Status, publishAllowed: true }, // held (not verified)
];
const selected = mixed.filter((c) => isPublishable(c, { consent: true })).map((c) => c.id);
check("T13 held claims excluded by ABSENCE only (no negation emitted)", JSON.stringify(selected) === JSON.stringify(["a"]));

console.log("== Area 3 — contradiction resolution ==");
check("T14 CONTRADICTS with no resolvedAt blocks verification", contradictionBlocks(unresolvedContradicts) && !canVerify(observed, [strongWebsite, unresolvedContradicts]).ok);
check("T15 CONTRADICTS with resolvedAt + resolvedBy is ignored by the gate", !contradictionBlocks(resolvedContradicts) && canVerify(observed, [strongWebsite, resolvedContradicts]).ok);
check("T16 resolutionNote alone (no resolvedAt/By) is NOT enough — still blocks", contradictionBlocks(noteOnlyContradicts) && !canVerify(observed, [strongWebsite, noteOnlyContradicts]).ok);

console.log("== Area 4 — verification carry-forward across canon versions ==");
const prevVerified: Claim = { ...observed, status: "VERIFIED" };
check("T17 identical category+statement+value inherits verification (links copied)", (() => { const r = inherit(prevVerified, [strongWebsite], { ...observed, status: "DRAFT" }); return r.status === "VERIFIED" && r.links.length === 1; })());
check("T18 changed value -> resets to DRAFT (no links)", (() => { const r = inherit(prevVerified, [strongWebsite], { ...observed, status: "DRAFT", value: { service: "Warehousing-XL" } }); return r.status === "DRAFT" && r.links.length === 0; })());
check("T19 changed statement -> resets to DRAFT", inherit(prevVerified, [strongWebsite], { ...observed, status: "DRAFT", statement: "provides warehousing (dry)" }).status === "DRAFT");
check("T20 changed category -> resets to DRAFT", inherit(prevVerified, [strongWebsite], { ...observed, status: "DRAFT", category: "differentiator" }).status === "DRAFT");
console.log("  NOTE: expected evidence-link behavior on inherit = COPIED (carried forward) for an identical fact; a changed fact forces re-linking (links reset).");

console.log("-".repeat(60));
console.log(`WP-21D-A claim-gate spec: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
