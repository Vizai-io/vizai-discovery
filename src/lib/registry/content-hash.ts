/**
 * WP-19D / WP-21C (DEC-035) — canonical content hash for the public artifact.
 *
 * MUST match the registry Beacon / vizai-registry-mcp `registry_reader._content_hash`:
 *
 *     "sha256:" + sha256( json.dumps(profile, sort_keys=True, separators=(",", ":")) )
 *
 * Python's `json.dumps` defaults to `ensure_ascii=True`: every codepoint > 0x7F is
 * emitted as a `\uXXXX` escape (astral codepoints as a UTF-16 surrogate pair). This
 * module emulates that exactly, so the hash matches the Beacon for BOTH ASCII and
 * non-ASCII payloads (e.g. "Café Résolution Ltée", "Trois-Rivières, Québec").
 *
 * WP-21C note: prior to WP-21C this used raw `JSON.stringify`, which is byte-identical
 * to Python for ASCII but diverged on the first accented character. The escaping below
 * closes that gap (DEC-035). For ASCII payloads the output is byte-identical to before,
 * so the published VizAI hash `sha256:43ace6d6…776a82` is unchanged (regression-guarded
 * by src/lib/truth/__tests__/hash-parity.spec.ts).
 */

import { createHash } from "node:crypto";

/** Emulate Python `json.dumps` string escaping with `ensure_ascii=True`. */
function asciiEscapeString(s: string): string {
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
      // Astral plane → UTF-16 surrogate pair, matching Python's ensure_ascii output.
      const c = cp - 0x10000;
      out +=
        "\\u" + (0xd800 + (c >> 10)).toString(16).padStart(4, "0") +
        "\\u" + (0xdc00 + (c & 0x3ff)).toString(16).padStart(4, "0");
    }
  }
  return out + '"';
}

/**
 * Deterministic canonical JSON: recursively sorted keys, no whitespace, ASCII-escaped —
 * byte-identical to Python `json.dumps(sort_keys=True, separators=(",",":"))`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return asciiEscapeString(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalJson(v === undefined ? null : v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // JSON.stringify semantics: undefined-valued properties are dropped.
    const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
    for (const k of keys) {
      // JS sorts keys by UTF-16 code unit; Python by codepoint — they can disagree for
      // non-ASCII keys. Artifact keys come from the allowlist mapper and are always ASCII;
      // throw rather than risk a hash that silently diverges from the Beacon.
      if (/[^\x00-\x7f]/.test(k)) {
        throw new Error(`Non-ASCII object key not permitted in canonical hash: ${JSON.stringify(k)}`);
      }
    }
    return "{" + keys.map((k) => asciiEscapeString(k) + ":" + canonicalJson(record[k])).join(",") + "}";
  }
  throw new Error("Unsupported value in canonical JSON (function/symbol/bigint)");
}

/** "sha256:<hex>" over the canonical JSON — identical to the registry Beacon method. */
export function contentHash(value: unknown): string {
  return "sha256:" + createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
