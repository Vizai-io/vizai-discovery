/**
 * WP-19F — tests for the B+C convergence (DB-row -> entity-profile-v1.0 + READY/DRAFT writes).
 *
 * Run (standalone — no test framework in this app):
 *   npx dotenv-cli -e .env.local -- npx ts-node --transpile-only \
 *     --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *     src/lib/registry/__tests__/canon-convergence.test.ts
 *
 * Pure: transformer + buildPublishDraft + write-shaper. No DB, no network.
 */

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonToAppShaped,
  buildRegistryDraftWrites,
  assertApprovable,
  type CanonToAppShapedInput,
  type TransformerClaim,
} from "../canon-to-appshaped";
import { buildPublishDraft } from "../../services/registry-publish.service";
import { contentHash } from "../content-hash";
import { validate } from "../json-schema-mini";

const schema = JSON.parse(
  readFileSync(join(__dirname, "..", "entity-profile-v1.0.schema.json"), "utf8"),
) as Record<string, unknown>;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// ── Wills-shaped B-lineage rows (REAL TruthClaim categories) ──────────────────
function verified(
  claim: Omit<TransformerClaim, "status" | "origin" | "publishAllowed" | "evidence">,
): TransformerClaim {
  return {
    ...claim,
    status: "VERIFIED",
    origin: "OBSERVED",
    publishAllowed: true,
    evidence: [{ supportLevel: "STRONG", sourceType: "WEBSITE" }],
  };
}

const claims: TransformerClaim[] = [
  verified({ category: "business_type", value: { businessType: "Third-party logistics (3PL)" } }),
  verified({ category: "service", value: { service: "Warehousing" } }),
  verified({ category: "service", value: { service: "Distribution" } }),
  { category: "service", value: { service: "Fulfillment" }, status: "NEEDS_EVIDENCE" }, // held -> excluded
  verified({ category: "location", value: { location: "Smiths Falls" } }),
  verified({ category: "location", value: { location: "Brockville" } }),
  verified({ category: "industry", value: { industry: "Food & beverage" } }),
  verified({ category: "description", value: { description: "Serving Eastern Ontario since 1945" } }),
  verified({ category: "differentiator", value: { differentiator: "Fourth-generation family business" } }),
  verified({ category: "customer_segment", value: { customerType: "Retailers" } }), // dropped (no field)
  // credentials (held):
  { category: "certification", statement: "SQF Certification", value: { name: "SQF Certification" }, status: "NEEDS_EVIDENCE", evidence: [] },
  {
    category: "award",
    statement: "Canada's Best Managed",
    value: { name: "Canada's Best Managed Companies" },
    status: "VERIFIED",
    origin: "OBSERVED",
    publishAllowed: true,
    evidence: [{ supportLevel: "MODERATE", sourceType: "WEBSITE" }],
  },
];

const input: CanonToAppShapedInput = {
  version: 1,
  status: "APPROVED",
  approvedAt: "2026-06-13T00:00:00.000Z",
  approvedBy: "operator",
  businessName: "Wills Transfer Limited",
  primaryDomain: "willstransfer.com",
  entitySlug: "wills-transfer-limited",
  category: "Logistics",
  lastVerified: "2026-06-13",
  dateAdded: "2026-06-13",
  lastUpdated: "2026-06-13",
  claims,
};

const appShaped = canonToAppShaped(input);
const packet = buildPublishDraft(appShaped, { profileVersion: 3 });
const artifact = packet.generatedArtifact;
const raw = JSON.stringify(artifact, null, 2);
const profile = (artifact.profile ?? {}) as Record<string, unknown>;

// T1 — transformer maps claims correctly (aggregation, status filter, drops)
check(
  "T1 transformer aggregates VERIFIED claims by category; held + unmapped dropped",
  JSON.stringify(profile.services) === JSON.stringify(["Warehousing", "Distribution"]) &&
    Array.isArray(profile.locations) && (profile.locations as unknown[]).length === 2 &&
    JSON.stringify(profile.industriesServed) === JSON.stringify(["Food & beverage"]) &&
    (profile.businessType === "Third-party logistics (3PL)") &&
    Array.isArray(profile.claims) && (profile.claims as string[]).includes("Fourth-generation family business") &&
    !raw.includes("Fulfillment") && !raw.includes("Retailers"),
  raw,
);

// T2 — schema validation passes
const errs = validate(schema, artifact);
check("T2 artifact validates against entity-profile-v1.0", errs.length === 0, JSON.stringify(errs));

// T3 — held SQF/credential excluded
check(
  "T3 held credentials excluded (no credentials key; in heldClaimsExcluded)",
  artifact.credentials === undefined &&
    packet.heldClaimsExcluded.some((e) => e.name === "SQF Certification") &&
    packet.heldClaimsExcluded.some((e) => e.name === "Canada's Best Managed Companies"),
  JSON.stringify(artifact.credentials),
);

// T4 — held credential not negated
const heldGate = packet.gateResults.find((g) => g.gate === "held_claim_safety")!;
check(
  "T4 held credentials not negated (gate PASS; names absent from artifact)",
  heldGate.status === "PASS" && !raw.includes("SQF") && !raw.toLowerCase().includes("best managed"),
  heldGate.detail,
);

// T5 — verified + STRONG credential CAN cross
const inputStrong: CanonToAppShapedInput = {
  ...input,
  claims: [
    ...claims.filter((c) => c.category !== "certification" && c.category !== "award"),
    {
      category: "certification",
      statement: "ISO 9001",
      value: { name: "ISO 9001", issuingBody: "ISO" },
      status: "VERIFIED",
      origin: "OBSERVED",
      publishAllowed: true,
      evidence: [{ supportLevel: "STRONG", sourceType: "WEBSITE" }],
    },
  ],
};
const art5 = buildPublishDraft(canonToAppShaped(inputStrong)).generatedArtifact;
check(
  "T5 verified + STRONG credential crosses and still validates",
  !!art5.credentials && art5.credentials.length === 1 &&
    art5.credentials[0].name === "ISO 9001" &&
    art5.credentials[0].evidenceStatus === "evidence_verified" &&
    validate(schema, art5).length === 0,
  JSON.stringify(art5.credentials),
);

// T6 — private/internal fields excluded (artifact is allowlisted; no canon/internal keys)
const keys = new Set<string>();
(function walk(v: unknown): void {
  if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { keys.add(k.toLowerCase()); walk(val); }
})(artifact);
check(
  "T6 private/internal fields excluded",
  ["canonpayload", "private", "evidence", "evidencelinks", "statement", "internalnotes"].every((k) => !keys.has(k)),
  [...keys].join(","),
);

// T7 — Beacon hash deterministic + key-order independent
const h1 = contentHash(artifact);
const h2 = contentHash(JSON.parse(JSON.stringify(artifact)));
const reordered: Record<string, unknown> = {};
for (const k of Object.keys(artifact).reverse()) reordered[k] = (artifact as unknown as Record<string, unknown>)[k];
const h3 = contentHash(reordered);
check("T7 Beacon contentHash deterministic + key-order independent", h1 === h2 && h2 === h3 && h1 === packet.contentHash, `${h1} ${h2} ${h3}`);

// T8 — RegistryProfile READY write
const writes = buildRegistryDraftWrites({
  organizationId: "org_1", companyProfileId: "cp_1", canonVersionId: "canon_1", version: 3, packet,
});
check(
  "T8 RegistryProfile write = READY, payload=artifact, payloadHash=Beacon hash, registryId=entitySlug",
  writes.registryProfile.create.status === "READY" &&
    writes.registryProfile.create.payload === artifact &&
    writes.registryProfile.create.payloadHash === packet.contentHash &&
    writes.registryProfile.where.organizationId_registryId.registryId === artifact.entitySlug,
  JSON.stringify(writes.registryProfile.where),
);

// T9 — TruthPublishRecord DRAFT write
check(
  "T9 TruthPublishRecord write = DRAFT, version=3, exportPayload=packet, payloadHash=Beacon hash",
  writes.truthPublishRecord.create.status === "DRAFT" &&
    writes.truthPublishRecord.create.version === 3 &&
    writes.truthPublishRecord.create.exportPayload === packet &&
    writes.truthPublishRecord.create.payloadHash === packet.contentHash &&
    writes.truthPublishRecord.where.companyProfileId_version.version === 3,
  JSON.stringify(writes.truthPublishRecord.where),
);

// T10 — integer profileVersion in artifact (DEC-030 gate 4)
check(
  "T10 profileVersion is the integer from TruthPublishRecord.version",
  artifact.profileVersion === 3 && Number.isInteger(artifact.profileVersion),
  String(artifact.profileVersion),
);

// T11 — no external publish / no registry/MCP write (structural)
const writeTargets = Object.keys(writes);
const transformerSrc = readFileSync(join(__dirname, "..", "canon-to-appshaped.ts"), "utf8");
const banned = transformerSrc.split("\n").filter((l) => /^\s*import\s/.test(l)).join("\n").toLowerCase();
check(
  "T11 writes target only RegistryProfile + TruthPublishRecord; no http/fetch/registry/mcp imports",
  writeTargets.length === 2 && writeTargets.includes("registryProfile") && writeTargets.includes("truthPublishRecord") &&
    !/(http|fetch|business-registry|vizai-registry-mcp|supabase|prisma)/.test(banned),
  writeTargets.join(",") + " | " + banned,
);

// T12 — gates pass overall for the real-shaped fixture; operator still PENDING
check(
  "T12 technicalPass true; readyToPublish false (operator PENDING)",
  packet.technicalPass === true && packet.readyToPublish === false,
  JSON.stringify({ tech: packet.technicalPass, ready: packet.readyToPublish }),
);

// T13 — assertApprovable: passes a good packet; BLOCKS gate-fail and hash-drift (no persist)
function throws(fn: () => void): boolean { try { fn(); return false; } catch { return true; } }
const failPacket = { technicalPass: false, contentHash: "sha256:x", gateResults: [{ gate: "schema", status: "FAIL", detail: "bad" }] };
check(
  "T13 assertApprovable: passes good packet; blocks gate-fail and hash-drift",
  !throws(() => assertApprovable(packet)) &&
    throws(() => assertApprovable(failPacket)) &&
    throws(() => assertApprovable(packet, "sha256:different-hash")) &&
    !throws(() => assertApprovable(packet, packet.contentHash)),
  "",
);

// T14 — phase separation (structural): prepare writes NOTHING; approve persists via $transaction
const svcSrc = readFileSync(join(__dirname, "..", "..", "services", "truth-infrastructure.service.ts"), "utf8");
const prepareBody = svcSrc.slice(
  svcSrc.indexOf("async prepareRegistryPublishDraft("),
  svcSrc.indexOf("async approveRegistryPublishDraft("),
);
const approveBody = svcSrc.slice(
  svcSrc.indexOf("async approveRegistryPublishDraft("),
  svcSrc.indexOf("async generateForCanon("),
);
check(
  "T14 prepare phase writes nothing; approve phase persists via $transaction",
  prepareBody.length > 0 && approveBody.length > 0 &&
    !/\.upsert\(|\$transaction/.test(prepareBody) &&
    /\$transaction/.test(approveBody) && /buildRegistryDraftWrites/.test(approveBody) && /assertApprovable/.test(approveBody),
  `prepareWrite=${/\.upsert\(|\$transaction/.test(prepareBody)} approveTx=${/\$transaction/.test(approveBody)}`,
);

// T15 (WP-19G-VIZAI-REVISE) — descriptive tech businessType maps to category "technology";
// the full businessType phrase is preserved in profile.businessType; artifact still schema-valid.
const techInput: CanonToAppShapedInput = {
  ...input,
  category: "AI software / business intelligence platform",
  claims: [
    verified({ category: "business_type", value: { businessType: "AI software / business intelligence platform" } }),
    verified({ category: "service", value: { service: "Business fact intake and verification" } }),
    verified({ category: "industry", value: { industry: "Business intelligence" } }),
  ],
};
const techArt = buildPublishDraft(canonToAppShaped(techInput)).generatedArtifact;
const techProfile = (techArt.profile ?? {}) as Record<string, unknown>;
check(
  "T15 tech businessType -> category technology; profile.businessType phrase preserved; schema valid",
  techArt.category === "technology" &&
    techProfile.businessType === "AI software / business intelligence platform" &&
    validate(schema, techArt).length === 0,
  JSON.stringify({ category: techArt.category, businessType: techProfile.businessType }),
);

console.log("-".repeat(60));
console.log(`WP-19F tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
