/**
 * WP-19D — the seven publication gates (in-app port of the WP-19B gates).
 *
 * Gates 1-3 (evidence, clean-artifact text scan, forbidden markers) are MIRRORED
 * from business-registry/tools/validation/validate-entity-profile.py so the app's
 * pre-flight is byte-identical to the registry CI (defense in depth, both sides).
 *
 * Pure: no DB, no network.
 */

import { validate } from "./json-schema-mini";
import type { EntityProfile, ExcludedClaim, GateResult } from "./types";

// ── Mirrored verbatim from the registry CI validator ──────────────────────────
const FORBIDDEN_MARKERS = [
  "do_not_publish", "do not publish",
  "held_from_this_publication", "held from this publication",
  "needs evidence", "no_evidence_provided", "evidence_requested",
  "evidence_received", "expired_or_stale", "evidence_register",
  "evidence ledger", "evidenceledger",
  "truth_canon", "truthcanon", "truth canon",
  "pending_facts", "pendingfacts",
  "verification_worksheet", "verification_log", "worksheet",
  "onboarding-response", "onboarding_response",
  "publication_plan", "implementation_note", "implementation note",
  "reconfirm", "internal note", "internalnote", "internal-note",
  "working file", "golden rule", "blueprint-driven",
];
const FORBIDDEN_REGEX = [/\bWP-\d/, /\bDEC-\d{2,}/];
const UNGATED_CLAIM_KEYS = ["certifications", "memberships", "awards"];

// ── WP-19D addition: held != false (no negative/absence language) ─────────────
const BANNED_NEGATIVE = [
  "not certified", "uncertified", "is not certified", "are not certified",
  "no certification", "lacks certification", "without certification",
  "not accredited", "not a member", "does not hold", "no evidence of",
  "not licensed", "is false", "claim is false",
];

// Top-level keys allowed by the schema (clean-artifact structural check).
const SCHEMA_TOP_KEYS = new Set([
  "schemaVersion", "entitySlug", "businessIdentifier", "category", "verification",
  "profileVersion", "profileUrl", "profile", "credentials", "metadata",
]);
// Private/internal keys that must never appear anywhere in the artifact.
const PRIVATE_KEY_DENYLIST = new Set([
  "private", "_private", "_note", "_comment", "evidenceledger", "evidence",
  "verificationworksheet", "worksheet", "onboardingresponse", "onboarding",
  "internalnotes", "canonpayload", "payloadhash",
]);

function result(gate: string, status: GateResult["status"], detail: string): GateResult {
  return { gate, status, detail };
}

function allKeysLower(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) allKeysLower(v, acc);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k.toLowerCase());
      allKeysLower(v, acc);
    }
  }
  return acc;
}

export function gateEvidence(artifact: EntityProfile): GateResult {
  const problems: string[] = [];
  (artifact.credentials ?? []).forEach((cred, i) => {
    if (cred.evidenceStatus !== "evidence_verified" || cred.publicPublishAllowed !== true) {
      problems.push(`credentials[${i}] '${String(cred.name)}' not evidence_verified+public`);
    }
  });
  for (const key of UNGATED_CLAIM_KEYS) {
    if ((artifact as unknown as Record<string, unknown>)[key]) problems.push(`ungated '${key}' present`);
  }
  return problems.length
    ? result("evidence", "FAIL", problems.join("; "))
    : result("evidence", "PASS", "published credentials are evidence_verified + public; no ungated claim containers");
}

export function gateCleanArtifact(artifact: EntityProfile): GateResult {
  const problems: string[] = [];
  const extraTop = Object.keys(artifact).filter((k) => !SCHEMA_TOP_KEYS.has(k));
  if (extraTop.length) problems.push(`non-schema top-level keys: ${JSON.stringify(extraTop)}`);
  const leaked = [...allKeysLower(artifact)].filter((k) => PRIVATE_KEY_DENYLIST.has(k));
  if (leaked.length) problems.push(`private/internal keys leaked: ${JSON.stringify(leaked)}`);
  return problems.length
    ? result("clean_artifact", "FAIL", problems.join("; "))
    : result("clean_artifact", "PASS", "built from allowlist; only schema-permitted keys; no private/internal keys");
}

export function gateForbiddenTerms(rawText: string): GateResult {
  const lower = rawText.toLowerCase();
  const hits = FORBIDDEN_MARKERS.filter((m) => lower.includes(m));
  for (const rx of FORBIDDEN_REGEX) {
    const m = rawText.match(rx);
    if (m) hits.push(m[0]);
  }
  return hits.length
    ? result("forbidden_terms", "FAIL", `forbidden markers found: ${JSON.stringify([...new Set(hits)].sort())}`)
    : result("forbidden_terms", "PASS", "no forbidden/internal markers (DEC-028 marker set) in the artifact text");
}

export function gateHeldClaimSafety(rawText: string, excluded: ExcludedClaim[]): GateResult {
  const lower = rawText.toLowerCase();
  const neg = BANNED_NEGATIVE.filter((p) => lower.includes(p));
  const present = excluded.filter((e) => e.name && lower.includes(e.name.toLowerCase())).map((e) => e.name);
  const problems: string[] = [];
  if (neg.length) problems.push(`negative/absence language present: ${JSON.stringify(neg)}`);
  if (present.length) problems.push(`held claim names appear in the artifact (must be absent): ${JSON.stringify(present)}`);
  return problems.length
    ? result("held_claim_safety", "FAIL", problems.join("; "))
    : result("held_claim_safety", "PASS", `${excluded.length} held claim(s) excluded by absence; no negative language; held names not present`);
}

export function gateSchema(artifact: EntityProfile, schema: Record<string, unknown>): GateResult {
  const errors = validate(schema, artifact);
  return errors.length
    ? result("schema", "FAIL", errors.map((e) => `${e.path}: ${e.message}`).join("; "))
    : result("schema", "PASS", "validates against entity-profile-v1.0 (vendored schema)");
}

export function gateOperatorApproval(): GateResult {
  return result("operator_approval", "PENDING", "awaiting explicit human approval; the service never auto-approves");
}

export function gateCiPreview(technical: GateResult[]): GateResult {
  const mirrored = technical.filter((r) =>
    ["schema", "clean_artifact", "forbidden_terms", "evidence"].includes(r.gate),
  );
  const allPass = mirrored.every((r) => r.status === "PASS");
  return result(
    "ci",
    "PREVIEW",
    `local mirror of registry validate-registry.yml (schema+clean+evidence) = ${allPass ? "PASS" : "FAIL"}; real CI runs on the human-opened PR (not opened)`,
  );
}

export interface GateReport {
  gates: GateResult[];
  technicalPass: boolean;
  readyToPublish: boolean;
}

export function runGates(
  artifact: EntityProfile,
  rawText: string,
  excluded: ExcludedClaim[],
  schema: Record<string, unknown>,
): GateReport {
  const technical = [
    gateEvidence(artifact),
    gateCleanArtifact(artifact),
    gateForbiddenTerms(rawText),
    gateHeldClaimSafety(rawText, excluded),
    gateSchema(artifact, schema),
  ];
  const operator = gateOperatorApproval();
  const ci = gateCiPreview(technical);
  const technicalPass = technical.every((r) => r.status === "PASS");
  return {
    gates: [...technical, operator, ci],
    technicalPass,
    readyToPublish: technicalPass && operator.status === "PASS", // false — operator PENDING
  };
}
