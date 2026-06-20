/**
 * WP-19G — tests for manual external publish (export package + mark-published gate/writes + wiring).
 *
 * Run:
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *     src/lib/registry/__tests__/external-publish.test.ts
 *
 * Pure: package builder + gate + write shaper + error mapping. Route/component WIRING by source scan
 * (handlers call Next/DB and can't run headless). No DB, no network.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildExportPackage,
  assertMarkPublishable,
  buildMarkPublishedWrites,
} from "../external-publish";
import { publishErrorStatus } from "../publish-http";
import { contentHash } from "../content-hash";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
}
function throws(fn: () => void): boolean { try { fn(); return false; } catch { return true; } }

const SRC = join(__dirname, "..", "..", "..");
function read(...segs: string[]): string { return readFileSync(join(SRC, ...segs), "utf8"); }

// ── clean artifact (= RegistryProfile.payload) ────────────────────────────────
const artifact = {
  schemaVersion: "1.0",
  entitySlug: "wills-transfer",
  businessIdentifier: { legalName: "Wills Transfer Limited", commonName: "Wills Transfer", primaryDomain: "willstransfer.com" },
  category: "logistics",
  verification: { status: "claimed_verified", method: "customer-canon-approval", lastVerified: "2026-06-13", tier: "claimed_verified", canonVersion: "1.0" },
  profile: { services: ["Warehousing"], industriesServed: ["Food & beverage"] },
  metadata: { dateAdded: "2026-06-13", lastUpdated: "2026-06-13" },
  profileVersion: 3,
};
const realHash = contentHash(artifact);
const exportPayload = {
  generatedArtifact: artifact,
  heldClaimsExcluded: [{ name: "SQF Certification", reason: "requires verification — not published" }],
  gateResults: [{ gate: "schema", status: "PASS", detail: "" }],
};
const pkg = buildExportPackage({
  registryProfileId: "rp_1", payload: artifact, payloadHash: realHash, registryId: "wills-transfer",
  truthPublishRecordId: "tpr_1", truthPublishRecordVersion: 3, exportPayload,
});

// T1 — package shape
check(
  "T1 export package: artifact + slug + version + source ids + PR text + checklist + internalReview",
  pkg.artifact === artifact && pkg.entitySlug === "wills-transfer" && pkg.profileVersion === 3 &&
    pkg.source.registryProfileId === "rp_1" && pkg.source.truthPublishRecordId === "tpr_1" &&
    pkg.source.canonVersion === "1.0" && pkg.prTitle.includes("wills-transfer") && pkg.prDescription.length > 0 &&
    pkg.validationChecklist.length >= 3 && pkg.internalReview.heldClaimsExcluded.length === 1,
  "",
);

// T2 — public artifact excludes held/private/internal; held only in operator-only internalReview
const artifactStr = JSON.stringify(pkg.artifact);
check(
  "T2 public artifact excludes held/private/internal; held claims only in internalReview",
  !artifactStr.includes("heldClaimsExcluded") && !artifactStr.includes("SQF") &&
    !artifactStr.includes("gateResults") && !artifactStr.includes("internalReview") && !artifactStr.includes("notes") &&
    JSON.stringify(pkg.internalReview).includes("SQF"),
  "",
);

// T3 — suggested registry path
check("T3 suggested registry path correct", pkg.suggestedRegistryPath === "registry/wills-transfer/profile.json", pkg.suggestedRegistryPath);

// T4 — contentHash equals payloadHash and matches the artifact
check(
  "T4 contentHash equals payloadHash and matches artifact",
  pkg.contentHash === realHash && pkg.contentHash === contentHash(pkg.artifact),
  pkg.contentHash,
);

// T5 — assertMarkPublishable gate
const ok = { registryProfileStatus: "READY", truthPublishStatus: "DRAFT", payloadHash: "h", confirmedContentHash: "h", prUrl: "https://github.com/x/pull/1" };
check(
  "T5 mark-published gate: passes good; blocks missing prUrl/hash, non-READY, non-DRAFT, hash mismatch",
  !throws(() => assertMarkPublishable(ok)) &&
    throws(() => assertMarkPublishable({ ...ok, prUrl: "" })) &&
    throws(() => assertMarkPublishable({ ...ok, confirmedContentHash: "" })) &&
    throws(() => assertMarkPublishable({ ...ok, registryProfileStatus: "DRAFT" })) &&
    throws(() => assertMarkPublishable({ ...ok, truthPublishStatus: "PUBLISHED" })) &&
    throws(() => assertMarkPublishable({ ...ok, confirmedContentHash: "different" })),
  "",
);

// T6 — buildMarkPublishedWrites: PUBLISHED statuses + PR URL recorded, existing payload preserved
const writes = buildMarkPublishedWrites({
  registryProfileId: "rp_1", truthPublishRecordId: "tpr_1", prUrl: "https://github.com/x/pull/1",
  confirmedContentHash: "h", existingExportPayload: { kept: true }, now: "2026-06-17T00:00:00.000Z",
});
const ep = writes.truthPublishRecord.data.exportPayload as Record<string, any>;
check(
  "T6 mark-published writes: both PUBLISHED, PR URL in notes + exportPayload.externalPublish, existing kept",
  writes.registryProfile.data.status === "PUBLISHED" &&
    writes.truthPublishRecord.data.status === "PUBLISHED" &&
    writes.truthPublishRecord.data.notes.includes("https://github.com/x/pull/1") &&
    ep.externalPublish.prUrl === "https://github.com/x/pull/1" && ep.kept === true,
  "",
);

// T7 — error -> status mapping
check(
  "T7 publishErrorStatus: mismatch 409, required 400, must-be-ready/draft 409, not-found 404",
  publishErrorStatus("contentHash mismatch — …") === 409 &&
    publishErrorStatus("prUrl is required.") === 400 &&
    publishErrorStatus("RegistryProfile must be READY to publish (got DRAFT).") === 409 &&
    publishErrorStatus("TruthPublishRecord must be DRAFT to publish (got PUBLISHED).") === 409 &&
    publishErrorStatus("RegistryProfile not found.") === 404,
  "",
);

// ── structural: routes + component + pure module ──────────────────────────────
const exportRoute = read("app", "api", "registry-profile", "[id]", "external-publish", "export", "route.ts");
const markRoute = read("app", "api", "registry-profile", "[id]", "external-publish", "mark-published", "route.ts");
const extPub = read("lib", "registry", "external-publish.ts");
const component = read("components", "publishing", "external-publish-section.tsx");

// T8 — export route: admin, read-only, no DB write, no GitHub/MCP
check(
  "T8 export route: admin GET, calls exportPackage, no DB write, no GitHub/MCP",
  exportRoute.includes("exportPackage") && exportRoute.includes("Admin access required") &&
    !/\.upsert\(|\.update\(|\$transaction/.test(exportRoute) &&
    !/octokit|api\.github/i.test(exportRoute) && !/from\s+["'][^"']*(mcp|signal)/.test(exportRoute),
  "",
);

// T9 — mark-published route: requires 3 fields, calls markPublished, no GitHub
check(
  "T9 mark-published route: requires truthPublishRecordId+prUrl+confirmedContentHash, calls markPublished, no GitHub",
  markRoute.includes("truthPublishRecordId") && markRoute.includes("prUrl") && markRoute.includes("confirmedContentHash") &&
    /are required/.test(markRoute) && markRoute.includes("status: 400") && markRoute.includes("markPublished") &&
    !/octokit|api\.github/i.test(markRoute) && !/from\s+["'][^"']*(mcp|signal)/.test(markRoute),
  "",
);

// T10 — external-publish.ts is pure (no imports of DB/network/GitHub) and no GitHub usage
check(
  "T10 external-publish.ts is pure: no imports, no GitHub/MCP usage",
  !/^\s*import\s/m.test(extPub) && !/octokit|api\.github/i.test(extPub),
  "",
);

// T11 — component wiring
check(
  "T11 component uses export + mark-published endpoints, sends the 3 fields, has the warning",
  component.includes("/external-publish/export") && component.includes("/external-publish/mark-published") &&
    component.includes("truthPublishRecordId") && component.includes("confirmedContentHash") &&
    component.includes("does not publish automatically") &&
    !/octokit|api\.github/i.test(component),
  "",
);

console.log("-".repeat(60));
console.log(`WP-19G tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
