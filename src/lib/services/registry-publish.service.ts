/**
 * WP-19D — In-app publish-boundary service (smallest-safe, fixtures-only).
 *
 * Projects an APPROVED app Canon to a clean entity-profile-v1.0 artifact, runs the
 * seven publication gates, computes the canonical contentHash, and assembles a
 * draft publish packet that STOPS at operator review.
 *
 * PURE / SAFE: no DB read or write, no Prisma, no network, no Supabase, no migration,
 * no PR, no registry write, no MCP/signal write. Honors Vizai-discovery migration
 * rules (Postgres-only / no new infrastructure / reuse over compatibility layers):
 * this service introduces no infrastructure — it is a pure mapping/validation module
 * that the existing truth-canon publish flow can call later.
 */

import schema from "../registry/entity-profile-v1.0.schema.json";
import { mapCanonToProfile } from "../registry/entity-profile-mapper";
import { runGates, type GateReport } from "../registry/publish-gates";
import { contentHash } from "../registry/content-hash";
import type { AppShapedCanon, EntityProfile, ExcludedClaim } from "../registry/types";

export interface DraftPublishPacket {
  packetType: "draft-publish-packet";
  status: "DRAFT_PENDING_HUMAN_APPROVAL";
  boundary: string;
  entitySlug: string;
  sourceCanonVersion: number;
  targetRegistryPath: string;
  generatedArtifact: EntityProfile;
  contentHash: string;
  profileVersion: {
    requested: string;
    schemaSupports: string;
    decision: string;
    reason: string;
  };
  validationResult: { schema: string; detail: string };
  gateResults: GateReport["gates"];
  technicalPass: boolean;
  readyToPublish: boolean;
  heldClaimsExcluded: ExcludedClaim[];
  contentHashParity?: {
    method: string;
    generatedHash: string;
    expectedHash: string;
    match: boolean;
    note: string;
  };
  operatorApproval: { status: "PENDING_HUMAN_APPROVAL"; approvedBy: null; approvedAt: null };
  recommendedNextManualSteps: string[];
}

export interface BuildOptions {
  /** Integer profileVersion (DEC-030 gate 4 -> TruthPublishRecord.version). Omitted in V1. */
  profileVersion?: number;
  /** Known published hash to check parity against (e.g. the live Wills hash). */
  expectedContentHash?: string;
}

/**
 * Build a draft publish packet from an approved Canon. Pure and side-effect-free.
 * Throws only if the Canon is not APPROVED (publication precondition).
 */
export function buildPublishDraft(canon: AppShapedCanon, opts: BuildOptions = {}): DraftPublishPacket {
  if (canon.status !== "APPROVED") {
    throw new Error(`Canon must be APPROVED to prepare a publish draft (got '${canon.status}')`);
  }

  const { artifact, excluded } = mapCanonToProfile(canon, { profileVersion: opts.profileVersion });
  const rawText = JSON.stringify(artifact, null, 2);
  const gateReport = runGates(artifact, rawText, excluded, schema as Record<string, unknown>);
  const hash = contentHash(artifact);
  const slug = artifact.entitySlug;

  const schemaGate = gateReport.gates.find((g) => g.gate === "schema")!;

  const packet: DraftPublishPacket = {
    packetType: "draft-publish-packet",
    status: "DRAFT_PENDING_HUMAN_APPROVAL",
    boundary: "Vizai-discovery (private) -> business-registry (public) [one-directional, WP-19]",
    entitySlug: slug,
    sourceCanonVersion: canon.version,
    targetRegistryPath: `registry/${slug}/profile.json`,
    generatedArtifact: artifact,
    contentHash: hash,
    profileVersion: {
      requested: "integer (DEC-030 gate 4)",
      schemaSupports: "integer (minimum 1)",
      decision:
        opts.profileVersion === undefined
          ? "OMITTED in this fixtures-only build (preserves parity with the live published profile)"
          : `set to ${opts.profileVersion}`,
      reason:
        "Public artifact profileVersion is an INTEGER sourced from TruthPublishRecord.version. " +
        "Semver (e.g. '1.0.0') stays in app/report metadata only — never the public artifact.",
    },
    validationResult: { schema: schemaGate.status, detail: schemaGate.detail },
    gateResults: gateReport.gates,
    technicalPass: gateReport.technicalPass,
    readyToPublish: gateReport.readyToPublish,
    heldClaimsExcluded: excluded,
    operatorApproval: { status: "PENDING_HUMAN_APPROVAL", approvedBy: null, approvedAt: null },
    recommendedNextManualSteps: [
      "1. Operator reviews this draft packet and the generated artifact.",
      "2. Operator approves (records approvedBy/approvedAt).",
      `3. Operator MANUALLY opens a PR adding registry/${slug}/profile.json to business-registry (not done here).`,
      "4. business-registry CI (validate-registry.yml) validates schema + clean-artifact + evidence + duplicates.",
      "5. A human MERGES the PR to main (no auto-merge).",
      "6. vizai-registry-mcp refetches; Truth Beacon recomputes contentHash; Change Feed emits the event.",
      "7. Record the publish in TruthPublishRecord (version, payloadHash, status, operator, PR/CI/Beacon refs).",
    ],
  };

  if (opts.expectedContentHash) {
    const match = hash === opts.expectedContentHash;
    packet.contentHashParity = {
      method:
        "sha256 over canonical JSON (sorted keys, no whitespace) — identical to the registry Beacon / registry_reader._content_hash",
      generatedHash: hash,
      expectedHash: opts.expectedContentHash,
      match,
      note: match
        ? "generated artifact is canonically identical to the live published profile; the TS hash matches the registry/Beacon hash"
        : "generated artifact differs from the expected profile (honest mismatch, not faked)",
    };
  }

  return packet;
}
