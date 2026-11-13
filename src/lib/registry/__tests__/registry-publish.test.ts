/**
 * WP-19D — tests for the in-app publish-boundary service (fixtures-only).
 *
 * Run (no test framework in this app — standalone ts-node script):
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *       src/lib/registry/__tests__/registry-publish.test.ts
 *
 * Pure: reads fixtures + vendored schema only. No DB, no network.
 */

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mapCanonToProfile } from "../entity-profile-mapper";
import { gateForbiddenTerms, runGates } from "../publish-gates";
import { contentHash } from "../content-hash";
import { validate } from "../json-schema-mini";
import { willsCanonFixture } from "../fixtures/wills-canon.fixture";
import { buildPublishDraft } from "../../services/registry-publish.service";
import type { AppShapedCanon } from "../types";

const schema = JSON.parse(
  readFileSync(join(__dirname, "..", "entity-profile-v1.0.schema.json"), "utf8"),
) as Record<string, unknown>;

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

// The live file carries profileVersion 1; the synced schema requires it.
const { artifact, excluded } = mapCanonToProfile(willsCanonFixture, { profileVersion: 1 });
const raw = JSON.stringify(artifact, null, 2);
const lower = raw.toLowerCase();

// T1 — mapper emits valid entity-profile-v1.0
const errs = validate(schema, artifact);
check("T1 mapper emits schema-valid entity-profile-v1.0", errs.length === 0, JSON.stringify(errs));

// T2 — schema validation passes via the gate
const report = runGates(artifact, raw, excluded, schema);
const schemaGate = report.gates.find((g) => g.gate === "schema")!;
check("T2 schema gate PASS", schemaGate.status === "PASS", schemaGate.detail);

// T3 — held SQF credential excluded
check(
  "T3 held SQF excluded (no credentials key; SQF in excluded list)",
  artifact.credentials === undefined && excluded.some((e) => e.name === "SQF Certification"),
  JSON.stringify(artifact.credentials),
);

// T4 — held credential not negated
const heldGate = report.gates.find((g) => g.gate === "held_claim_safety")!;
const namesAbsent = excluded.every((e) => !lower.includes(e.name.toLowerCase()));
check(
  "T4 held claims not negated (no negative language; names absent)",
  heldGate.status === "PASS" && namesAbsent,
  heldGate.detail,
);

// T5 — verified + STRONG credential CAN cross
const canon2 = JSON.parse(JSON.stringify(willsCanonFixture)) as AppShapedCanon;
canon2.credentialClaims = [
  {
    name: "ISO 9001",
    credentialType: "certification",
    issuingBody: "ISO",
    issueDate: "2025-01-01",
    status: "VERIFIED",
    evidence: [{ supportLevel: "STRONG", sourceType: "CUSTOMER_PROVIDED" }],
  },
];
const { artifact: art2 } = mapCanonToProfile(canon2, { profileVersion: 1 });
check(
  "T5 verified + STRONG credential crosses and validates",
  !!art2.credentials &&
    art2.credentials.length === 1 &&
    art2.credentials[0].name === "ISO 9001" &&
    art2.credentials[0].evidenceStatus === "evidence_verified" &&
    art2.credentials[0].publicPublishAllowed === true &&
    validate(schema, art2).length === 0,
  JSON.stringify(art2.credentials),
);

// T6 — private/internal fields excluded
const allKeys = new Set<string>();
(function walk(v: unknown): void {
  if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { allKeys.add(k.toLowerCase()); walk(val); }
})(artifact);
const privateMarkers = ["private", "evidenceledger", "verificationworksheet", "onboardingresponse", "internalnotes"];
check(
  "T6 private/internal fields excluded",
  privateMarkers.every((k) => !allKeys.has(k)) && !lower.includes("do_not_publish") && !lower.includes("redacted-person"),
  [...allKeys].join(","),
);

// T7 — forbidden/private terms blocked (clean PASS + dirty control FAIL)
const cleanScan = gateForbiddenTerms(raw);
const dirtyScan = gateForbiddenTerms(JSON.stringify({ x: "do_not_publish per WP-19 and DEC-027" }));
check(
  "T7 forbidden-term scan: clean PASS, dirty FAIL",
  cleanScan.status === "PASS" && dirtyScan.status === "FAIL",
  `${cleanScan.status}/${dirtyScan.status}`,
);

// T8 — hash deterministic + key-order independent
const h1 = contentHash(artifact);
const h2 = contentHash(JSON.parse(JSON.stringify(artifact)));
const reordered: Record<string, unknown> = {};
for (const k of Object.keys(artifact).reverse()) reordered[k] = (artifact as unknown as Record<string, unknown>)[k];
const h3 = contentHash(reordered);
check("T8 contentHash deterministic and key-order independent", h1 === h2 && h2 === h3, `${h1} ${h2} ${h3}`);

// T9 — shape + named-field parity with the CURRENT live published profile
// (WP-19F: byte/hash parity is impossible by construction — canonVersion is
// derived as `${version}.0`, so a v2 regeneration yields "2.0"; the retired
// pre-Jul-16 hash asserted an artifact with `tier` and no profileVersion /
// publication, which the live file no longer matches).
const liveProfile = (artifact.profile ?? {}) as Record<string, unknown>;
const liveLocations = (liveProfile.locations ?? []) as Array<Record<string, unknown>>;
check(
  "T9 Wills artifact matches the live published profile (shape + named fields)",
  artifact.schemaVersion === "1.0" &&
    artifact.entitySlug === "wills-transfer" &&
    artifact.profileVersion === 1 &&
    artifact.businessIdentifier.legalName === "Wills Transfer Limited" &&
    artifact.businessIdentifier.commonName === "Wills Transfer" &&
    artifact.businessIdentifier.primaryDomain === "willstransfer.com" &&
    artifact.category === "logistics" &&
    artifact.verification.status === "claimed_verified" &&
    artifact.verification.method === "customer-canon-approval" &&
    artifact.verification.canonVersion === "1.0" &&
    artifact.verification.lastVerified === "2026-06-13" &&
    !("tier" in artifact.verification) &&
    artifact.publication?.policyVersion === "1.0" &&
    artifact.publication?.consentReceipt.status === "recorded" &&
    artifact.publication?.consentReceipt.reference === "canon:wills-transfer:1.0" &&
    artifact.metadata.dateAdded === "2026-06-13" &&
    artifact.metadata.lastUpdated === "2026-07-16" &&
    liveProfile.businessType === "Third-party logistics (3PL), warehousing, fulfillment, distribution" &&
    liveProfile.country === "Canada" &&
    liveProfile.yearFounded === 1945 &&
    liveProfile.ownership === "Fourth-generation family business" &&
    JSON.stringify(liveProfile.scale) === JSON.stringify({ facilityCount: 7, totalSquareFeet: "1000000+", locationCount: 5, region: "Eastern Ontario" }) &&
    liveLocations.length === 5 &&
    liveLocations[0].name === "Smiths Falls" && liveLocations[0].region === "ON" && liveLocations[0].role === "headquarters" &&
    liveLocations[4].name === "Perth" && liveLocations[4].region === "ON" && liveLocations[4].role === "facility" &&
    Array.isArray(liveProfile.services) && (liveProfile.services as unknown[]).length === 19 &&
    Array.isArray(liveProfile.industriesServed) && (liveProfile.industriesServed as unknown[]).length === 10 &&
    JSON.stringify(liveProfile.claims) === JSON.stringify([
      "Serving Eastern Ontario and Western Quebec since 1945",
      "Provides innovative logistics solutions that contribute to customers' success",
    ]) &&
    JSON.stringify(liveProfile.contact) === JSON.stringify({ phone: "+1-613-283-0225", tollFree: "+1-800-267-7937", email: "info@willstransfer.com", website: "https://www.willstransfer.com" }) &&
    JSON.stringify(liveProfile.profiles) === JSON.stringify({ linkedin: "https://ca.linkedin.com/company/wills-transfer-limited", facebook: "https://www.facebook.com/WillsTransferLimited/" }),
  JSON.stringify({ slug: artifact.entitySlug, category: artifact.category, verification: artifact.verification, publication: artifact.publication, metadata: artifact.metadata, claims: liveProfile.claims }),
);

// T10 — no DB writes (no Prisma/db imports in the modules)
// T11 — no network calls (no http/fetch/supabase imports)
const moduleFiles = [
  "content-hash.ts", "json-schema-mini.ts", "entity-profile-mapper.ts",
  "publish-gates.ts", "types.ts", "fixtures/wills-canon.fixture.ts",
].map((f) => join(__dirname, "..", f));
moduleFiles.push(join(__dirname, "..", "..", "services", "registry-publish.service.ts"));

const BANNED_ON_IMPORT = ["prisma", "supabase", "http", "https", "node:net", "fetch", "axios", "dotenv", "pg", "next/server"];
const dbNetViolations: string[] = [];
for (const file of moduleFiles) {
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const isImport = /^\s*import\s/.test(line) || /require\s*\(/.test(line);
    if (!isImport) continue;
    for (const tok of BANNED_ON_IMPORT) {
      if (line.toLowerCase().includes(tok)) dbNetViolations.push(`${file}: ${line.trim()}`);
    }
  }
}
check("T10 no DB writes (no prisma/db imports in modules)", !dbNetViolations.some((v) => /prisma|supabase|pg/i.test(v)), dbNetViolations.join(" | "));
check("T11 no network calls (no http/fetch imports in modules)", dbNetViolations.length === 0, dbNetViolations.join(" | "));

// Bonus — buildPublishDraft end-to-end (uses the service's schema import) + operator gate.
// No expectedContentHash: hash parity with the retired pre-Jul-16 artifact is
// impossible by construction (see the fixture header); the check is that the
// draft is schema-valid, technically passing, and still awaiting a human.
const packet = buildPublishDraft(willsCanonFixture, { profileVersion: 1 });
check(
  "T12 buildPublishDraft: technicalPass, operator PENDING, not ready to publish",
  packet.technicalPass === true &&
    packet.operatorApproval.status === "PENDING_HUMAN_APPROVAL" &&
    packet.readyToPublish === false &&
    packet.generatedArtifact.profileVersion === 1 &&
    packet.generatedArtifact.publication?.consentReceipt.reference === "canon:wills-transfer:1.0",
  JSON.stringify({ tech: packet.technicalPass, ready: packet.readyToPublish, gates: packet.gateResults }),
);

console.log("-".repeat(60));
console.log(`WP-19D tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
