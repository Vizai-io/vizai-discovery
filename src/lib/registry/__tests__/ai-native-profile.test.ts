/**
 * WP-21C-GH — tests for the AI-native profile generator (pure rendering).
 *
 * Run (no test framework in this app — standalone ts-node script):
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *       src/lib/registry/__tests__/ai-native-profile.test.ts
 *
 * Pure: builds from an inline Wills Canon v1.0 fixture (the exact 53
 * VERIFIED facts: 19 services, 5 locations, 10 industries, 7
 * differentiators, 10 customer types + business type + description).
 * No DB, no network.
 */

import {
  buildAiNativeProfile,
  deriveCommonName,
  slugifyName,
  parseLocation,
  extractContact,
  extractFoundedYear,
  type AiNativeProfileInput,
} from "../ai-native-profile";
import type { CanonicalBusiness } from "../../services/truth-export.service";
import { buildExportPackage } from "../external-publish";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

// ── Wills Canon v1.0 fixture (mirrors the live published profile.json) ──
const WILLS_DESCRIPTION =
  "Wills Transfer Limited is a fourth-generation family business and Canadian third-party logistics (3PL), warehousing, fulfillment, and distribution provider founded in 1945 and headquartered in Smiths Falls, Ontario. The company operates 7 facilities totalling over 1,000,000 square feet across Eastern Ontario, with locations in Smiths Falls (headquarters), Brockville, Cornwall, Ottawa, and Perth. Wills provides warehousing (dry, air-conditioned, cooler, frozen), third-party logistics, distribution, fulfillment, pick and pack, kitting, asset tagging, container de-stuffing, cross docking, inventory management, rail car siding, refrigerated storage, outsourcing solutions, shunting services, managed 3PL labour services, warehouse management system (WMS) services, fleet management, transportation solutions, and integration solutions. The company serves the food and beverage, pharmaceutical, construction, industrial, tech, pulp and paper, oil and gas, manufacturing, retail, and last mile sectors, and has served Eastern Ontario and Western Quebec since 1945. Contact: +1-613-283-0225 (toll-free +1-800-267-7937), info@willstransfer.com.";

const willsBusiness: CanonicalBusiness = {
  name: "Wills Transfer Limited",
  website: "https://www.willstransfer.com",
  description: WILLS_DESCRIPTION,
  business_type: "Third-party logistics (3PL), warehousing, fulfillment, distribution",
  services: [
    "Asset tagging",
    "Container de-stuffing",
    "Cross docking",
    "Distribution",
    "Fleet management",
    "Fulfillment",
    "Integration solutions",
    "Inventory management",
    "Kitting",
    "Managed 3PL labour services",
    "Outsourcing solutions",
    "Pick and pack",
    "Rail car siding",
    "Refrigerated storage",
    "Shunting services",
    "Third-party logistics",
    "Transportation solutions",
    "Warehouse management system (WMS) services",
    "Warehousing (dry, air-conditioned, cooler, frozen)",
  ],
  locations: [
    "Brockville, Ontario",
    "Cornwall, Ontario",
    "Ottawa, Ontario",
    "Perth, Ontario",
    "Smiths Falls, Ontario (headquarters)",
  ],
  industries: [
    "Construction",
    "Food & beverage",
    "Industrial",
    "Last mile",
    "Manufacturing",
    "Oil & Gas",
    "Pharmaceutical",
    "Pulp & Paper",
    "Retail",
    "Tech",
  ],
  differentiators: [
    "7 facilities totalling over 1,000,000 square feet",
    "Fourth-generation family business",
    "In business since 1945",
    "Provides innovative logistics solutions that contribute to customers' success",
    "Rail car siding",
    "Refrigerated storage (cooler and frozen)",
    "Serving Eastern Ontario and Western Quebec since 1945",
  ],
  customer_types: [
    "Construction companies",
    "Food and beverage companies",
    "Industrial companies",
    "Last mile delivery businesses",
    "Manufacturers",
    "Oil and gas companies",
    "Pharmaceutical companies",
    "Pulp and paper companies",
    "Retailers",
    "Technology companies",
  ],
};

const input: AiNativeProfileInput = {
  business: willsBusiness,
  entitySlug: "wills-transfer",
  slugSource: "legal-suffix-strip",
  commonName: "Wills Transfer",
  canonVersion: 1,
  canonStatus: "DRAFT",
  verificationStatus: "claimed_verified",
  verificationMethod: "customer-canon-approval",
  lastVerified: "2026-06-13",
  lastVerifiedSource:
    "OWNER_ATTESTATION evidence source 'Wills Transfer Canon v1.0 signed verification worksheet'",
  verifiedClaimCount: 53,
  heldClaims: [
    {
      name: "SQF certification",
      reason: "OBSERVED certification (status DRAFT, truthType OBSERVED) — held from public output: evidence required, evidenceStatus no_evidence_provided (GR15)",
    },
    {
      name: "Controlled Goods certification",
      reason: "OBSERVED certification (status DRAFT, truthType OBSERVED) — held from public output: evidence required, evidenceStatus no_evidence_provided (GR15)",
    },
    {
      name: "Approved Security Level B",
      reason: "OBSERVED certification (status DRAFT, truthType OBSERVED) — held from public output: evidence required, evidenceStatus no_evidence_provided (GR15)",
    },
  ],
  registryConsentRecorded: false,
  generatedAt: "2026-11-12T20:00:00.000Z",
};

const result = buildAiNativeProfile(input);
const { indexHtml, llmsTxt, jsonLd, meta } = result;
const combined = `${indexHtml}\n${llmsTxt}`;
const lower = combined.toLowerCase();

// T1 — Canon fact counts in both files
const countIn = (text: string, needle: string): number =>
  text.split(needle).length - 1;
check(
  "T1 19 services / 5 locations / 10 industries / 7 differentiators / 10 customer types in both files",
  willsBusiness.services.every((s) => indexHtml.includes(s) && llmsTxt.includes(s)) &&
    willsBusiness.locations.every((l) => {
      const parsed = parseLocation(l);
      return indexHtml.includes(parsed.name) && llmsTxt.includes(parsed.name);
    }) &&
    willsBusiness.industries.every((i) => indexHtml.includes(i.replace(/&/g, "&amp;")) && llmsTxt.includes(i)) &&
    willsBusiness.differentiators.every((d) => indexHtml.includes(d) && llmsTxt.includes(d)) &&
    willsBusiness.customer_types.every((c) => indexHtml.includes(c) && llmsTxt.includes(c)),
  "",
);

// T2 — JSON-LD parses; LocalBusiness with the expected fields, 19 offers
let parsed: Record<string, unknown> | null = null;
try {
  const m = indexHtml.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/);
  parsed = m ? (JSON.parse(m[1]) as Record<string, unknown>) : null;
} catch {
  parsed = null;
}
const offers = (
  (parsed?.hasOfferCatalog as Record<string, unknown> | undefined)?.itemListElement as unknown[]
) ?? [];
check(
  "T2 JSON-LD parses: @type LocalBusiness, name/legalName/url, 19 offers, no streetAddress/postalCode/geo",
  parsed !== null &&
    parsed["@type"] === "LocalBusiness" &&
    parsed["name"] === "Wills Transfer Limited" &&
    parsed["legalName"] === "Wills Transfer Limited" &&
    parsed["url"] === "https://www.willstransfer.com" &&
    offers.length === 19 &&
    !("streetAddress" in ((parsed["address"] as Record<string, unknown>) ?? {})) &&
    !("postalCode" in ((parsed["address"] as Record<string, unknown>) ?? {})) &&
    !("geo" in parsed),
  `parsed=${parsed === null ? "null" : "ok"} offers=${offers.length}`,
);
check(
  "T2b generated JSON-LD equals the returned jsonLd object",
  JSON.stringify(parsed) === JSON.stringify(jsonLd),
  "",
);

// T3 — forbidden / non-Canon terms appear NOWHERE in either file
const FORBIDDEN = [
  "sqf",
  "controlled goods",
  "security level b",
  "security-cleared",
  "146 highway",
  "k7a 4t2",
  "po box 340",
  "50,000",
  "20,000",
  "toronto",
  "montreal",
  "north america",
  "eastern seaboard",
  "60%",
  "co-packing",
  "assembly",
  "cp rail",
  "wills-transfer-limited",
  "v2 draft",
  "linkedin",
  "facebook",
];
const found = FORBIDDEN.filter((t) => lower.includes(t));
check("T3 no SQF / certs / street address / geo / Toronto / Montreal / socials / wrong slug", found.length === 0, `found: ${found.join(", ")}`);

// T4 — correct slug + suggested paths
check(
  "T4 entitySlug wills-transfer; paths docs/profiles/wills-transfer/index.html + llms.txt",
  result.entitySlug === "wills-transfer" &&
    result.suggestedPaths.indexHtml === "docs/profiles/wills-transfer/index.html" &&
    result.suggestedPaths.llmsTxt === "docs/profiles/wills-transfer/llms.txt",
  JSON.stringify(result.suggestedPaths),
);

// T5 — contact + founded year extracted from VERIFIED prose
check(
  "T5 phone +1-613-283-0225, toll-free +1-800-267-7937, email info@willstransfer.com, founded 1945 present",
  indexHtml.includes("+1-613-283-0225") &&
    indexHtml.includes("+1-800-267-7937") &&
    indexHtml.includes("info@willstransfer.com") &&
    llmsTxt.includes("+1-613-283-0225") &&
    parsed?.["foundingDate"] === "1945" &&
    parsed?.["telephone"] === "+1-613-283-0225",
  "",
);

// T6 — no Certifications section; held claims recorded in metadata only
check(
  "T6 no Certifications section in either file; 3 held claims in meta, none in the files",
  !indexHtml.includes("Certifications") &&
    !llmsTxt.includes("Certifications") &&
    meta.heldClaims.length === 3 &&
    meta.heldClaims.every((h) => h.reason.includes("GR15")),
  "",
);

// T7 — verification cites Canon v1.0 claimed_verified, lastVerified 2026-06-13, DRAFT + consent state
check(
  "T7 verification cites Canon v1.0 claimed_verified, last verified 2026-06-13; canon DRAFT; consent not recorded",
  indexHtml.includes("Canon v1.0, claimed_verified, last verified 2026-06-13") &&
    indexHtml.includes("Canon status: DRAFT") &&
    indexHtml.includes("registry listing consent: not recorded") &&
    llmsTxt.includes("Canon v1.0, claimed_verified, last verified 2026-06-13") &&
    meta.canonVersionLabel === "1.0" &&
    meta.lastVerified === "2026-06-13" &&
    meta.registryConsentRecorded === false,
  "",
);

// T8 — differentiators + customer types spot checks (ownership, scale, claim)
check(
  "T8 ownership + scale + claims present as VERIFIED differentiators",
  indexHtml.includes("Fourth-generation family business") &&
    indexHtml.includes("7 facilities totalling over 1,000,000 square feet") &&
    indexHtml.includes("Serving Eastern Ontario and Western Quebec since 1945") &&
    llmsTxt.includes("Pharmaceutical companies"),
  "",
);

// T9 — HTML escaping: ampersands escaped in HTML, raw in llms.txt / JSON
check(
  "T9 HTML escapes ampersands (Food &amp; beverage); llms.txt keeps raw text",
  indexHtml.includes("Food &amp; beverage") &&
    !indexHtml.includes(">Food & beverage<") &&
    llmsTxt.includes("Food & beverage"),
  "",
);

// T10 — derivation helpers
check(
  "T10 deriveCommonName/slugify: 'Wills Transfer Limited' -> 'Wills Transfer' -> 'wills-transfer'",
  deriveCommonName("Wills Transfer Limited") === "Wills Transfer" &&
    slugifyName("Wills Transfer") === "wills-transfer" &&
    deriveCommonName("Acme Inc.") === "Acme",
  "",
);
const hq = parseLocation("Smiths Falls, Ontario (headquarters)");
const contact = extractContact(WILLS_DESCRIPTION);
check(
  "T10b parseLocation + extractContact + extractFoundedYear from VERIFIED text",
  hq.name === "Smiths Falls" &&
    hq.regionCode === "ON" &&
    hq.role === "headquarters" &&
    parseLocation("Brockville, Ontario").role === "facility" &&
    contact.phone === "+1-613-283-0225" &&
    contact.tollFree === "+1-800-267-7937" &&
    contact.email === "info@willstransfer.com" &&
    extractFoundedYear(WILLS_DESCRIPTION, willsBusiness.differentiators) === 1945 &&
    extractContact(null).phone === null &&
    extractFoundedYear(null, []) === null,
  JSON.stringify({ hq, contact }),
);

// T11 — meta records slug source, extraction notes, and omissions
check(
  "T11 meta: slugSource legal-suffix-strip, extraction notes + omitted list present",
  meta.slugSource === "legal-suffix-strip" &&
    meta.extractionNotes.length >= 2 &&
    meta.omitted.length >= 4 &&
    meta.verifiedClaimCount === 53,
  JSON.stringify(meta.extractionNotes),
);

// T12 — export package carries the AI-native files; absent (null) without them
const pkgWith = buildExportPackage({
  registryProfileId: "rp_1",
  payload: {
    schemaVersion: "1.0",
    entitySlug: "wills-transfer",
    businessIdentifier: { legalName: "Wills Transfer Limited", commonName: "Wills Transfer", primaryDomain: "willstransfer.com" },
    verification: { status: "claimed_verified", method: "customer-canon-approval", lastVerified: "2026-06-13", canonVersion: "1.0" },
    profileVersion: 2,
  },
  payloadHash: "sha256:deadbeef",
  registryId: "wills-transfer",
  truthPublishRecordId: "tpr_1",
  truthPublishRecordVersion: 2,
  exportPayload: null,
  aiNative: {
    indexHtml: result.indexHtml,
    llmsTxt: result.llmsTxt,
    indexPath: result.suggestedPaths.indexHtml,
    llmsPath: result.suggestedPaths.llmsTxt,
  },
});
const pkgWithout = buildExportPackage({
  registryProfileId: "rp_1",
  payload: { schemaVersion: "1.0", entitySlug: "wills-transfer", profileVersion: 2 },
  payloadHash: "sha256:deadbeef",
  registryId: "wills-transfer",
  truthPublishRecordId: null,
  truthPublishRecordVersion: null,
  exportPayload: null,
});
check(
  "T12 export package: aiNative files + paths in PR text/checklist; null + no lines when ungeneratable",
  pkgWith.aiNative !== null &&
    pkgWith.aiNative.indexPath === "docs/profiles/wills-transfer/index.html" &&
    pkgWith.aiNative.llmsTxt === result.llmsTxt &&
    pkgWith.prDescription.includes("docs/profiles/wills-transfer/index.html") &&
    pkgWith.prDescription.includes("docs/profiles/wills-transfer/llms.txt") &&
    pkgWith.validationChecklist.some((c) => c.includes("Place the AI-native files")) &&
    pkgWithout.aiNative === null &&
    !pkgWithout.prDescription.includes("docs/profiles/wills-transfer/index.html") &&
    pkgWithout.internalReview.aiNativeError === null,
  "",
);

console.log("-".repeat(60));
console.log(`WP-21C-GH ai-native-profile tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
