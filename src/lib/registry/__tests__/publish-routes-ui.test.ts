/**
 * WP-19F-UI — tests for the prepare/approve/candidate routes + review component wiring.
 *
 * Run (standalone — no Next test harness in this app):
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *     src/lib/registry/__tests__/publish-routes-ui.test.ts
 *
 * The error-status mapping is unit-tested; the route/component WIRING is verified by source scan
 * (the handlers call Next/Supabase and can't run headless here — same approach as the WP-19F
 * phase-separation test). The write/gate behavior itself is covered by the WP-19F service tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publishErrorStatus } from "../publish-http";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const SRC = join(__dirname, "..", "..", "..");
function read(...segs: string[]): string {
  return readFileSync(join(SRC, ...segs), "utf8");
}
const prepareRoute = read("app", "api", "truth-canon", "[id]", "publish", "prepare", "route.ts");
const approveRoute = read("app", "api", "truth-canon", "[id]", "publish", "approve", "route.ts");
const publishRoute = read("app", "api", "truth-canon", "[id]", "publish", "route.ts");
const component = read("components", "publishing", "registry-publish-review-panel.tsx");

// T1 — error -> status mapping (mismatch -> 409, gate failure -> 422, etc.)
check(
  "T1 publishErrorStatus maps service errors correctly",
  publishErrorStatus("Canon version not found.") === 404 &&
    publishErrorStatus("contentHash drift since review — re-prepare before approving.") === 409 &&
    publishErrorStatus("Canon must be APPROVED or PUBLISHED to generate a registry profile (got DRAFT).") === 409 &&
    publishErrorStatus("Publish gates failed — not persisting: schema: bad") === 422 &&
    publishErrorStatus("Cannot build public profile: company has no primary domain (websiteUrl).") === 422 &&
    publishErrorStatus("some other error") === 500,
  "",
);

// T2 — prepare route is read-only: calls prepareRegistryPublishDraft; never approve/write
check(
  "T2 prepare route calls prepareRegistryPublishDraft and writes nothing",
  prepareRoute.includes("prepareRegistryPublishDraft") &&
    !prepareRoute.includes("approveRegistryPublishDraft") &&
    !prepareRoute.includes("generateForCanon") &&
    !/\.upsert\(|\$transaction/.test(prepareRoute),
  "",
);

// T3 — approve route requires expectedContentHash, passes approvedBy=auth.uid, calls approve (which re-prepares)
check(
  "T3 approve route requires expectedContentHash + passes approvedBy=auth.uid + calls approveRegistryPublishDraft",
  approveRoute.includes("expectedContentHash") &&
    /expectedContentHash is required/i.test(approveRoute) &&
    approveRoute.includes("status: 400") &&
    approveRoute.includes("approveRegistryPublishDraft") &&
    approveRoute.includes("approvedBy: auth.uid"),
  "",
);

// T4 — existing publish route no longer auto-writes the registry candidate
check(
  "T4 publish route removed the generateForCanon auto-write (canon-internal only)",
  !publishRoute.includes("generateForCanon") &&
    !publishRoute.includes("RegistryProfileService") &&
    /does NOT publish to the public registry/i.test(publishRoute) &&
    publishRoute.includes("TruthCanonServiceV2.publish"),
  "",
);

// T5 — component is standalone B-lineage, uses the new routes, never reuses lineage-A panel
check(
  "T5 review component uses prepare/approve routes, sends expectedContentHash, warns, gates approve, not lineage A",
  component.includes("/publish/prepare") &&
    component.includes("/publish/approve") &&
    component.includes("expectedContentHash") &&
    component.includes("does not publish externally") &&
    /technicalPass/.test(component) && // approve gated on gates passing
    !/import[^;]+truth-publish-panel/.test(component) && // does not import/reuse the lineage-A panel
    !component.includes("/api/canonical-truth"), // not wired to lineage A
  "",
);

// T6 — mount page (WP-19F-UI-MOUNT): mounts the panel, B-lineage only, warns, not in nav
const mountPage = read("app", "(dashboard)", "monitoring", "registry-publish", "page.tsx");
check(
  "T6 mount page imports the panel, warns, supplies canonVersionId, not lineage A",
  /import[^;]+RegistryPublishReviewPanel/.test(mountPage) &&
    mountPage.includes("does not publish externally") &&
    mountPage.includes("canonVersionId") &&
    !/from\s+["'][^"']*truth-publish-panel/.test(mountPage) && // no actual import of the lineage-A panel
    !/["'][^"']*\/api\/canonical-truth/.test(mountPage), // no quoted canonical-truth endpoint
  "",
);


// T7 — candidate route is GET-only, ADMIN-gated, read-only: calls getReadyCandidate; never writes
const candidateRoute = read("app", "api", "truth-canon", "[id]", "publish", "candidate", "route.ts");
check(
  "T7 candidate route is GET-only + ADMIN-gated + read-only (getReadyCandidate, no writes)",
  candidateRoute.includes("export async function GET") &&
    !candidateRoute.includes("export async function POST") &&
    candidateRoute.includes('auth.role !== "ADMIN"') &&
    candidateRoute.includes("getReadyCandidate") &&
    !/\.upsert\(|\$transaction|\.create\(|\.update\(/.test(candidateRoute),
  "",
);

// T8 — service getReadyCandidate: READY findFirst, re-prepare hash check, payloadHash authoritative, drift signal
const service = read("lib", "services", "truth-infrastructure.service.ts");
const candidateFn = service.slice(service.indexOf("async getReadyCandidate"));
const candidateBody = candidateFn.slice(0, candidateFn.indexOf("\n  },"));
check(
  "T8 getReadyCandidate looks up READY, re-prepares + compares hash, returns payloadHash, signals drift",
  candidateBody.includes('status: "READY"') &&
    candidateBody.includes("prepareRegistryPublishDraft(canonVersionId, organizationId)") &&
    candidateBody.includes("savedHash !== currentHash") &&
    candidateBody.includes("drift: true") &&
    candidateBody.includes("contentHash: rp.payloadHash") &&
    !candidateBody.includes("tpr.payloadHash") &&
    candidateBody.includes("found: false") &&
    candidateBody.includes("found: true"),
  "",
);

// T9 — panel restores a READY candidate on mount: candidate GET, setApproved, drift notice, prepare clears it
check(
  "T9 review component restores a READY candidate on mount (candidate GET, setApproved, drift notice, prepare clears it)",
  component.includes("useEffect") &&
    component.includes("/publish/candidate") &&
    component.includes("setApproved(data as ApproveResult)") &&
    component.includes("candidateStale") &&
    component.includes("stale") &&
    component.includes("loadingCandidate") &&
    component.includes("setCandidateStale(false)"),
  "",
);

// T10 — candidate lookup also returns registry-consent context on every path (incl. no candidate)
check(
  "T10 getReadyCandidate returns companyProfileId + consent fields even when no READY candidate exists",
  candidateBody.includes("companyProfileId") &&
    candidateBody.includes("registryListingConsentAt") &&
    candidateBody.includes("registryListingConsentedBy") &&
    candidateBody.includes("truthCanonVersion.findFirst") &&
    candidateBody.includes("...consent"),
  "",
);

// T11 — panel has a consent control: POST record, DELETE revoke behind confirm + READY guard, shows recorded state
const consentRoute = read("app", "api", "company-profiles", "[id]", "registry-consent", "route.ts");
check(
  "T11 review component records/revokes consent via the existing route, guarded when a READY candidate exists",
  component.includes("/registry-consent") &&
    component.includes('method: "POST"') &&
    component.includes('method: "DELETE"') &&
    component.includes("window.confirm") &&
    component.includes("does NOT un-publish") &&
    component.includes("readyCandidateFound") &&
    component.includes("Record registry listing consent") &&
    component.includes("registryListingConsentAt") &&
    consentRoute.includes("requireHumanAdmin"),
  "",
);

// T12 -- export section surfaces the AI-native files (P2 #11): UI ExportPackage type
// carries source + aiNative (mirroring the route response), and the Export
// section has a Copy button per file wired to the file contents via the
// existing copyText helper; a missing aiNative degrades to a note, never
// empty copy buttons.
const exportSection = read("components", "publishing", "external-publish-section.tsx");
check(
  "T12 export section types source + aiNative and offers Copy index.html / Copy llms.txt with a not-generated note",
  exportSection.includes("source: { registryProfileId: string; truthPublishRecordId: string | null; canonVersion: string | null }") &&
    exportSection.includes("aiNative:") &&
    exportSection.includes("indexHtml: string") &&
    exportSection.includes("llmsTxt: string") &&
    exportSection.includes("indexPath: string") &&
    exportSection.includes("llmsPath: string") &&
    exportSection.includes("Copy index.html") &&
    exportSection.includes("Copy llms.txt") &&
    exportSection.includes("copyText(aiNative.indexHtml") &&
    exportSection.includes("copyText(aiNative.llmsTxt") &&
    exportSection.includes("were not generated for this export"),
  "",
);

console.log("-".repeat(60));
console.log(`WP-19F-UI tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
