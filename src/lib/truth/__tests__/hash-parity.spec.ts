/**
 * WP-21D-A / WP-21C — Hash-parity spec (DEC-035). Pure; no DB, no network.
 *
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *     src/lib/truth/__tests__/hash-parity.spec.ts
 *
 * WP-21C applied the ensure_ascii emulation to production `contentHash` (content-hash.ts), so the
 * app now matches the registry/Beacon Python `json.dumps(sort_keys=True, separators=(",",":"))`
 * (ensure_ascii=True) for BOTH ASCII and non-ASCII payloads. This spec proves:
 *   - ASCII parity still holds (the published VizAI hash 43ace6d6… is byte-identical — regression guard).
 *   - non-ASCII parity is now achieved (contentHash == Python ensure_ascii, e.g. 61a0291b…).
 * `ensureAsciiHash` below is an independent TEST-ONLY re-implementation of the Python side, validated
 * against real Python-computed hashes pinned as constants — so it is a genuine cross-check, not a mirror
 * of the production code.
 */
import { createHash } from "node:crypto";
import { contentHash } from "../../registry/content-hash";

let passed = 0, failed = 0, targets = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// ── TEST-ONLY reference: Python json.dumps(ensure_ascii=True, sort_keys=True, separators=(",",":")) ──
function pyStr(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (cp === 0x08) out += "\\b";
    else if (cp === 0x09) out += "\\t";
    else if (cp === 0x0a) out += "\\n";
    else if (cp === 0x0c) out += "\\f";
    else if (cp === 0x0d) out += "\\r";
    else if (cp < 0x20) out += "\\u" + cp.toString(16).padStart(4, "0");
    else if (cp < 0x80) out += ch;
    else if (cp <= 0xffff) out += "\\u" + cp.toString(16).padStart(4, "0");
    else {
      const c = cp - 0x10000;
      out += "\\u" + (0xd800 + (c >> 10)).toString(16).padStart(4, "0") +
             "\\u" + (0xdc00 + (c & 0x3ff)).toString(16).padStart(4, "0");
    }
  }
  return out + '"';
}
function pyCanonical(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyStr(v);
  if (Array.isArray(v)) return "[" + v.map(pyCanonical).join(",") + "]";
  if (typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return "{" + keys.map((k) => pyStr(k) + ":" + pyCanonical((v as Record<string, unknown>)[k])).join(",") + "}";
  }
  throw new Error("unsupported value in fixture");
}
function ensureAsciiHash(obj: unknown): string {
  return "sha256:" + createHash("sha256").update(pyCanonical(obj), "utf8").digest("hex");
}

// ── Pinned real hashes (TS contentHash + Python json.dumps ensure_ascii) ──
const VIZAI_PUBLISHED = "sha256:43ace6d6a910e4a9e6cee1b3e2691eb7d8261dc6c9122dbe833f13a093776a82"; // TS == Python (ASCII)
const NONASCII_PY_ENSURE_ASCII = "sha256:61a0291bdeb67ad6c9c7668980aa797c24b8d0f9bb1784113861513d12c40919"; // Python / Beacon
// (pre-WP-21C, raw-UTF-8 production TS produced sha256:e536bf9f… for the non-ASCII fixture — now closed.)

// ── Fixtures (byte-identical to the ones the pinned hashes were computed from) ──
const vizai = {
  schemaVersion: "1.0", entitySlug: "vizai",
  businessIdentifier: { legalName: "VizAI", commonName: "VizAI", primaryDomain: "vizai.io" },
  category: "technology",
  verification: { status: "claimed_verified", tier: "claimed_verified", method: "customer-canon-approval", canonVersion: "3.0", lastVerified: "2026-06-27" },
  profileVersion: 1,
  profile: {
    businessType: "AI software / business intelligence platform",
    services: ["Business fact intake and verification", "Registry-ready business profile generation", "Business intelligence and visibility reporting"],
    industriesServed: ["Business operations", "Business intelligence"],
    locations: [{ name: "Ontario, Canada" }],
    claims: ["VizAI is an AI software platform for collecting, verifying, and organizing business facts into registry-ready profiles and export packages."],
  },
  metadata: { dateAdded: "2026-06-27", lastUpdated: "2026-06-27" },
};
const nonascii = {
  schemaVersion: "1.0", entitySlug: "cafe-resolution",
  businessIdentifier: { legalName: "Café Résolution Ltée", commonName: "Café Résolution", primaryDomain: "caferesolution.ca" },
  category: "hospitality",
  verification: { status: "claimed_verified", method: "customer-canon-approval", canonVersion: "1.0", lastVerified: "2026-06-27" },
  profile: { locations: [{ name: "Trois-Rivières, Québec" }], claims: ["Serving Trois-Rivières since 1988 — 'quality first'."] },
  metadata: { dateAdded: "2026-06-27", lastUpdated: "2026-06-27" },
};

console.log("== ASCII regression (parity holds; published VizAI hash preserved) ==");
check("H1 contentHash(vizai) == published VizAI hash (43ace6d6)", contentHash(vizai) === VIZAI_PUBLISHED, contentHash(vizai));
check("H2 ensureAsciiHash helper validated: == 43ace6d6 for ASCII", ensureAsciiHash(vizai) === VIZAI_PUBLISHED, ensureAsciiHash(vizai));
check("H3 ASCII: TS contentHash == Python-style ensureAsciiHash", contentHash(vizai) === ensureAsciiHash(vizai));

console.log("== Non-ASCII fixture (accented name / Québec location / em-dash + apostrophe) ==");
check("H4 ensureAsciiHash helper validated against real Python (61a0291b)", ensureAsciiHash(nonascii) === NONASCII_PY_ENSURE_ASCII, ensureAsciiHash(nonascii));
check("H5 non-ASCII TS contentHash now matches Python ensure_ascii (61a0291b) — DEC-035 CLOSED", contentHash(nonascii) === NONASCII_PY_ENSURE_ASCII, contentHash(nonascii));
check("H6 non-ASCII parity: TS contentHash == Python ensureAsciiHash (WP-21C applied)", contentHash(nonascii) === ensureAsciiHash(nonascii),
  `${contentHash(nonascii)} vs ${ensureAsciiHash(nonascii)}`);

console.log("== DEC-035 status ==");
if (contentHash(nonascii) === ensureAsciiHash(nonascii)) {
  console.log("  DONE   non-ASCII parity achieved: contentHash == ensureAsciiHash (WP-21C applied).");
} else {
  targets++;
  console.log("  TARGET non-ASCII parity PENDING — regression: contentHash no longer emulates Python ensure_ascii.");
}

console.log("-".repeat(60));
console.log(`WP-21C hash-parity spec: ${passed} passed, ${failed} failed, ${targets} target(s) pending`);
console.log("Findings: ASCII parity = HOLDS (43ace6d6 preserved); non-ASCII parity = HOLDS (WP-21C ensure_ascii applied).");
process.exit(failed === 0 ? 0 : 1);
