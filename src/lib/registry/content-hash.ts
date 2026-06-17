/**
 * WP-19D — canonical content hash for the public artifact.
 *
 * MUST match the registry Beacon / vizai-registry-mcp `registry_reader._content_hash`:
 *
 *     "sha256:" + sha256( json.dumps(profile, sort_keys=True, separators=(",", ":")) )
 *
 * Python's `json.dumps(sort_keys=True, separators=(",",":"))` produces a canonical
 * JSON string with recursively sorted keys and no whitespace. We replicate it by
 * recursively sorting object keys and using `JSON.stringify` with no spacer
 * (which yields the same `,`/`:` separators).
 *
 * Parity note: the registry payloads are ASCII; for ASCII data this is byte-identical
 * to Python's default `ensure_ascii=True`. Non-ASCII payloads would need `\\uXXXX`
 * escaping to match Python exactly (out of scope — the registry is ASCII; CI/Beacon
 * remain authoritative). This is the same canonicalization the WP-19B prototype used.
 */

import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = canonicalize(input[key]);
    }
    return sorted;
  }
  return value;
}

/** Deterministic, key-order-independent JSON canonicalization (sorted keys, no whitespace). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** "sha256:<hex>" over the canonical JSON — identical to the registry Beacon method. */
export function contentHash(value: unknown): string {
  return "sha256:" + createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
