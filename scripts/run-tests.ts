import { spawnSync } from "node:child_process";

const tests = [
  "src/lib/registry-intelligence/__tests__/foundation.spec.ts",
  "src/lib/registry/__tests__/registry-publish.test.ts",
  "src/lib/registry/__tests__/publish-routes-ui.test.ts",
  "src/lib/registry/__tests__/external-publish.test.ts",
  "src/lib/registry/__tests__/canon-convergence.test.ts",
  "src/lib/truth/__tests__/hash-parity.spec.ts",
  "src/lib/truth/__tests__/claim-gate.spec.ts",
];

for (const test of tests) {
  const result = spawnSync(process.execPath, ["--import", "tsx", test], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`All ${tests.length} test files passed.`);
