import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const hardening = readFileSync(
  resolve("prisma/migrations/20260716000000_security_hardening/migration.sql"),
  "utf8",
);

const required = [
  "ENABLE ROW LEVEL SECURITY",
  "REVOKE ALL PRIVILEGES",
  "registry_crawl_runs_one_active_per_target",
  "rate_limit_counters",
];

for (const marker of required) {
  if (!hardening.includes(marker)) {
    console.error(`Migration security assertion missing: ${marker}`);
    process.exit(1);
  }
}

console.log("Migration security assertions passed.");
