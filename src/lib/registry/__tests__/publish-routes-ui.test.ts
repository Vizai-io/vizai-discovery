/**
 * WP-19F-UI — tests for the prepare/approve routes + review component wiring.
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

console.log("-".repeat(60));
console.log(`WP-19F-UI tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
