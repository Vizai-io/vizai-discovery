/**
 * @fileOverview Phase 0-1 truth infrastructure services.
 *
 * This module turns the existing CompanyProfile into an evidence-backed Canon,
 * graph, registry payload, authority artifact set, and persisted drift history.
 * Postgres is the operational source. GitHub/registry/schema.org are exports.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { PerceptionDriftService } from "@/lib/services/perception-drift.service";
import { buildCanonicalBusiness } from "@/lib/services/truth-export.service";
import { buildPublishDraft } from "@/lib/services/registry-publish.service";
import {
  canonToAppShaped,
  buildRegistryDraftWrites,
  assertApprovable,
  type TransformerClaim,
} from "@/lib/registry/canon-to-appshaped";
import type {
  AuthoritySourceStatus,
  EvidenceSourceType,
  EvidenceSupportLevel,
  Prisma,
  TruthEntityType,
  TruthGraphRelationType,
} from "@prisma/client";

type CanonProfile = {
  id: string;
  organizationId: string;
  businessName: string;
  websiteUrl: string | null;
  officialDescription: string | null;
  officialBusinessType: string | null;
  officialServices: string[];
  officialLocations: string[];
  officialIndustries: string[];
  officialDifferentiators: string[];
  officialCustomerTypes: string[];
};

type CanonPayload = {
  schema_version: "2.0";
  vizai_export_type: "truth_canon";
  organization_id: string;
  company_profile_id: string;
  generated_from: "platform_postgres";
  business: ReturnType<typeof buildCanonicalBusiness>;
  entities: Array<{ type: TruthEntityType; name: string; slug: string; data: Record<string, unknown> }>;
  claims: Array<{ category: string; statement: string; value: Record<string, unknown>; confidence: number }>;
  evidence: Array<{ id: string; title: string; type: EvidenceSourceType; url: string | null; contentHash: string | null }>;
};

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getPrimaryProfile(organizationId: string, companyProfileId?: string): Promise<CanonProfile | null> {
  if (companyProfileId) {
    return db.companyProfile.findFirst({
      where: { id: companyProfileId, organizationId, isActive: true },
    });
  }

  return db.companyProfile.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

function buildEntities(profile: CanonProfile): CanonPayload["entities"] {
  const entities: CanonPayload["entities"] = [
    {
      type: "COMPANY",
      name: profile.businessName,
      slug: slugify(profile.businessName),
      data: { website: profile.websiteUrl },
    },
  ];

  for (const service of profile.officialServices) {
    entities.push({ type: "SERVICE", name: service, slug: slugify(service), data: {} });
  }
  for (const location of profile.officialLocations) {
    entities.push({ type: "LOCATION", name: location, slug: slugify(location), data: {} });
  }
  for (const industry of profile.officialIndustries) {
    entities.push({ type: "INDUSTRY", name: industry, slug: slugify(industry), data: {} });
  }
  for (const customer of profile.officialCustomerTypes) {
    entities.push({ type: "CUSTOMER_SEGMENT", name: customer, slug: slugify(customer), data: {} });
  }

  return entities;
}

function buildClaims(profile: CanonProfile): CanonPayload["claims"] {
  const claims: CanonPayload["claims"] = [];

  if (profile.officialDescription) {
    claims.push({
      category: "description",
      statement: `${profile.businessName} description: ${profile.officialDescription}`,
      value: { description: profile.officialDescription },
      confidence: 80,
    });
  }
  if (profile.officialBusinessType) {
    claims.push({
      category: "business_type",
      statement: `${profile.businessName} is a ${profile.officialBusinessType}.`,
      value: { businessType: profile.officialBusinessType },
      confidence: 80,
    });
  }
  for (const service of profile.officialServices) {
    claims.push({
      category: "service",
      statement: `${profile.businessName} provides ${service}.`,
      value: { service },
      confidence: 75,
    });
  }
  for (const location of profile.officialLocations) {
    claims.push({
      category: "location",
      statement: `${profile.businessName} operates in ${location}.`,
      value: { location },
      confidence: 75,
    });
  }
  for (const industry of profile.officialIndustries) {
    claims.push({
      category: "industry",
      statement: `${profile.businessName} serves the ${industry} industry.`,
      value: { industry },
      confidence: 75,
    });
  }
  for (const customerType of profile.officialCustomerTypes) {
    claims.push({
      category: "customer_segment",
      statement: `${profile.businessName} serves ${customerType}.`,
      value: { customerType },
      confidence: 70,
    });
  }
  for (const differentiator of profile.officialDifferentiators) {
    claims.push({
      category: "differentiator",
      statement: `${profile.businessName} differentiator: ${differentiator}`,
      value: { differentiator },
      confidence: 65,
    });
  }

  return claims;
}

async function buildCanonPayload(profile: CanonProfile): Promise<CanonPayload> {
  const evidence = await db.evidenceSource.findMany({
    where: { organizationId: profile.organizationId, companyProfileId: profile.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, type: true, url: true, contentHash: true },
  });

  return {
    schema_version: "2.0",
    vizai_export_type: "truth_canon",
    organization_id: profile.organizationId,
    company_profile_id: profile.id,
    generated_from: "platform_postgres",
    business: buildCanonicalBusiness(profile),
    entities: buildEntities(profile),
    claims: buildClaims(profile),
    evidence,
  };
}

async function nextCanonVersion(companyProfileId: string): Promise<number> {
  const result = await db.truthCanonVersion.aggregate({
    where: { companyProfileId },
    _max: { version: true },
  });
  return (result._max.version ?? 0) + 1;
}

function relationForEntity(type: TruthEntityType): TruthGraphRelationType | null {
  switch (type) {
    case "SERVICE":
      return "PROVIDES";
    case "LOCATION":
      return "OPERATES_IN";
    case "INDUSTRY":
    case "CUSTOMER_SEGMENT":
      return "SERVES";
    default:
      return null;
  }
}

export const EvidenceService = {
  async create(input: {
    organizationId: string;
    companyProfileId: string;
    type: EvidenceSourceType;
    title: string;
    url?: string | null;
    evidenceText?: string | null;
    sourceDate?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const profile = await getPrimaryProfile(input.organizationId, input.companyProfileId);
    if (!profile) throw new Error("Company profile not found.");

    const contentHash = input.evidenceText ? stableHash(input.evidenceText) : input.url ? stableHash(input.url) : null;

    const existing = input.url
      ? await db.evidenceSource.findFirst({
          where: { organizationId: input.organizationId, companyProfileId: input.companyProfileId, url: input.url },
        })
      : null;

    if (existing) {
      return db.evidenceSource.update({
        where: { id: existing.id },
        data: {
          type: input.type,
          title: input.title,
          evidenceText: input.evidenceText ?? existing.evidenceText,
          sourceDate: input.sourceDate ? new Date(input.sourceDate) : existing.sourceDate,
          contentHash,
          metadata: json(input.metadata ?? {}),
        },
      });
    }

    return db.evidenceSource.create({
      data: {
        organizationId: input.organizationId,
        companyProfileId: input.companyProfileId,
        type: input.type,
        title: input.title,
        url: input.url ?? null,
        evidenceText: input.evidenceText ?? null,
        sourceDate: input.sourceDate ? new Date(input.sourceDate) : null,
        contentHash,
        metadata: json(input.metadata ?? {}),
      },
    });
  },

  async list(organizationId: string, companyProfileId?: string) {
    return db.evidenceSource.findMany({
      where: { organizationId, ...(companyProfileId ? { companyProfileId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  },
};

export const TruthCanonServiceV2 = {
  async getState(organizationId: string, companyProfileId?: string) {
    const profile = await getPrimaryProfile(organizationId, companyProfileId);
    if (!profile) return null;

    const [latestDraft, latestApproved, latestPublished, evidenceCount, claimCount, entityCount] = await Promise.all([
      db.truthCanonVersion.findFirst({ where: { organizationId, companyProfileId: profile.id, status: "DRAFT" }, orderBy: { version: "desc" } }),
      db.truthCanonVersion.findFirst({ where: { organizationId, companyProfileId: profile.id, status: "APPROVED" }, orderBy: { version: "desc" } }),
      db.truthCanonVersion.findFirst({ where: { organizationId, companyProfileId: profile.id, status: "PUBLISHED" }, orderBy: { version: "desc" } }),
      db.evidenceSource.count({ where: { organizationId, companyProfileId: profile.id } }),
      db.truthClaim.count({ where: { organizationId, companyProfileId: profile.id } }),
      db.truthEntity.count({ where: { organizationId, companyProfileId: profile.id } }),
    ]);

    return { profile, latestDraft, latestApproved, latestPublished, evidenceCount, claimCount, entityCount };
  },

  async createOrRefreshDraft(organizationId: string, companyProfileId?: string) {
    const profile = await getPrimaryProfile(organizationId, companyProfileId);
    if (!profile) throw new Error("No active company profile found.");

    const payload = await buildCanonPayload(profile);
    const payloadHash = stableHash(payload);

    let draft = await db.truthCanonVersion.findFirst({
      where: { organizationId, companyProfileId: profile.id, status: "DRAFT" },
      orderBy: { version: "desc" },
    });

    if (draft) {
      draft = await db.truthCanonVersion.update({
        where: { id: draft.id },
        data: {
          title: `${profile.businessName} Truth Canon`,
          summary: payload.business.description,
          canonPayload: json(payload),
          payloadHash,
        },
      });
    } else {
      draft = await db.truthCanonVersion.create({
        data: {
          organizationId,
          companyProfileId: profile.id,
          version: await nextCanonVersion(profile.id),
          title: `${profile.businessName} Truth Canon`,
          summary: payload.business.description,
          canonPayload: json(payload),
          payloadHash,
        },
      });
    }

    await this.materializeDraft(draft.id, organizationId);
    return this.getVersion(draft.id, organizationId);
  },

  async materializeDraft(canonVersionId: string, organizationId: string) {
    const canon = await db.truthCanonVersion.findFirst({
      where: { id: canonVersionId, organizationId },
    });
    if (!canon) throw new Error("Canon version not found.");

    const payload = canon.canonPayload as CanonPayload;
    const company = payload.entities.find((entity) => entity.type === "COMPANY");
    if (!company) throw new Error("Canon payload missing company entity.");

    const entityByKey = new Map<string, string>();

    for (const entity of payload.entities) {
      const saved = await db.truthEntity.upsert({
        where: {
          organizationId_companyProfileId_type_slug: {
            organizationId,
            companyProfileId: canon.companyProfileId,
            type: entity.type,
            slug: entity.slug,
          },
        },
        create: {
          organizationId,
          companyProfileId: canon.companyProfileId,
          canonVersionId: canon.id,
          type: entity.type,
          name: entity.name,
          slug: entity.slug,
          data: json(entity.data),
        },
        update: {
          canonVersionId: canon.id,
          name: entity.name,
          data: json(entity.data),
        },
      });
      entityByKey.set(`${entity.type}:${entity.slug}`, saved.id);
    }

    const companyId = entityByKey.get(`COMPANY:${company.slug}`);

    for (const claim of payload.claims) {
      const existing = await db.truthClaim.findFirst({
        where: {
          organizationId,
          companyProfileId: canon.companyProfileId,
          canonVersionId: canon.id,
          statement: claim.statement,
        },
      });

      if (!existing) {
        await db.truthClaim.create({
          data: {
            organizationId,
            companyProfileId: canon.companyProfileId,
            canonVersionId: canon.id,
            category: claim.category,
            statement: claim.statement,
            value: json(claim.value),
            status: payload.evidence.length > 0 ? "VERIFIED" : "NEEDS_EVIDENCE",
            confidence: payload.evidence.length > 0 ? Math.max(claim.confidence, 85) : claim.confidence,
          },
        });
      }
    }

    if (companyId) {
      for (const entity of payload.entities.filter((item) => item.type !== "COMPANY")) {
        const toEntityId = entityByKey.get(`${entity.type}:${entity.slug}`);
        const relationType = relationForEntity(entity.type);
        if (!toEntityId || !relationType) continue;

        await db.truthGraphEdge.upsert({
          where: {
            organizationId_companyProfileId_fromEntityId_toEntityId_relationType: {
              organizationId,
              companyProfileId: canon.companyProfileId,
              fromEntityId: companyId,
              toEntityId,
              relationType,
            },
          },
          create: {
            organizationId,
            companyProfileId: canon.companyProfileId,
            fromEntityId: companyId,
            toEntityId,
            relationType,
          },
          update: { weight: 100 },
        });
      }
    }
  },

  async getVersion(id: string, organizationId: string) {
    return db.truthCanonVersion.findFirst({
      where: { id, organizationId },
      include: {
        companyProfile: true,
        entities: true,
        claims: { include: { evidenceLinks: { include: { evidenceSource: true } } } },
        registryProfiles: true,
      },
    });
  },

  async approve(id: string, organizationId: string, approvedBy: string) {
    const canon = await db.truthCanonVersion.findFirst({ where: { id, organizationId, status: "DRAFT" } });
    if (!canon) throw new Error("Draft Canon not found.");
    return db.truthCanonVersion.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedBy },
    });
  },

  async publish(id: string, organizationId: string) {
    const canon = await db.truthCanonVersion.findFirst({
      where: { id, organizationId, status: { in: ["APPROVED", "DRAFT"] } },
    });
    if (!canon) throw new Error("Canon version not found or already published.");

    return db.$transaction(async (tx) => {
      await tx.truthCanonVersion.updateMany({
        where: { organizationId, companyProfileId: canon.companyProfileId, status: "PUBLISHED" },
        data: { status: "SUPERSEDED", supersededAt: new Date() },
      });

      return tx.truthCanonVersion.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          approvedAt: canon.approvedAt ?? new Date(),
          publishedAt: new Date(),
        },
      });
    });
  },
};

export const TruthGraphService = {
  async getGraph(organizationId: string, companyProfileId?: string) {
    const profile = await getPrimaryProfile(organizationId, companyProfileId);
    if (!profile) return null;

    const [entities, edges] = await Promise.all([
      db.truthEntity.findMany({ where: { organizationId, companyProfileId: profile.id }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
      db.truthGraphEdge.findMany({
        where: { organizationId, companyProfileId: profile.id },
        include: { fromEntity: true, toEntity: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return { companyProfileId: profile.id, entities, edges };
  },
};

export const RegistryProfileService = {
  /**
   * WP-19F: load the canon + its TruthClaim rows (PRIMARY source) + evidence links,
   * resolve identity (canonPayload is fallback/reference only), and shape the
   * transformer input for `canonToAppShaped`.
   */
  async loadCanonForArtifact(canonVersionId: string, organizationId: string) {
    const canon = await db.truthCanonVersion.findFirst({
      where: { id: canonVersionId, organizationId },
      include: { companyProfile: true, claims: { include: { evidenceLinks: true } } },
    });
    if (!canon) throw new Error("Canon version not found.");
    if (canon.status !== "APPROVED" && canon.status !== "PUBLISHED") {
      throw new Error(`Canon must be APPROVED or PUBLISHED to generate a registry profile (got ${canon.status}).`);
    }

    const fallback = (canon.canonPayload as CanonPayload | null) ?? null;
    const businessName = canon.companyProfile?.businessName ?? fallback?.business?.name ?? "";
    if (!businessName) throw new Error("Cannot build public profile: missing business name.");
    const websiteUrl = canon.companyProfile?.websiteUrl ?? fallback?.business?.website ?? null;
    const primaryDomain = domainFromUrl(websiteUrl);
    if (!primaryDomain) throw new Error("Cannot build public profile: company has no primary domain (websiteUrl).");

    const claims: TransformerClaim[] = canon.claims.map((cl) => ({
      category: cl.category,
      value: cl.value,
      status: cl.status,
      statement: cl.statement,
      evidence: cl.evidenceLinks.map((el) => ({ supportLevel: el.supportLevel })),
    }));

    const date = today();
    return {
      companyProfileId: canon.companyProfileId,
      input: {
        version: canon.version,
        status: canon.status,
        approvedAt: canon.approvedAt ? canon.approvedAt.toISOString() : null,
        approvedBy: canon.approvedBy,
        businessName,
        primaryDomain,
        entitySlug: slugify(businessName),
        category: canon.companyProfile?.officialBusinessType ?? fallback?.business?.business_type ?? undefined,
        lastVerified: date,
        dateAdded: date,
        lastUpdated: date,
        claims,
      },
    };
  },

  /** Read-only: the integer profileVersion the next draft will carry (= TruthPublishRecord.version). */
  async resolveDraftProfileVersion(companyProfileId: string): Promise<number> {
    const existingDraft = await db.truthPublishRecord.findFirst({
      where: { companyProfileId, status: "DRAFT" },
      orderBy: { version: "desc" },
    });
    if (existingDraft) return existingDraft.version;
    const agg = await db.truthPublishRecord.aggregate({ where: { companyProfileId }, _max: { version: true } });
    return (agg._max.version ?? 0) + 1;
  },

  /**
   * PREPARE phase — read-only, NO DB write. Projects the canon's TruthClaim rows to a clean
   * `entity-profile-v1.0` draft via `buildPublishDraft` (Beacon hash + the 7 gates) and returns the
   * review payload: clean artifact, gate results, held/excluded claims, contentHash, profileVersion.
   * Writes NOTHING — operator review happens on this output before `approveRegistryPublishDraft`.
   */
  async prepareRegistryPublishDraft(canonVersionId: string, organizationId: string) {
    const { companyProfileId, input } = await this.loadCanonForArtifact(canonVersionId, organizationId);
    const profileVersion = await this.resolveDraftProfileVersion(companyProfileId);
    const packet = buildPublishDraft(canonToAppShaped(input), { profileVersion });
    return { canonVersionId, companyProfileId, profileVersion, packet };
  },

  /**
   * APPROVE / PERSIST phase — WRITES. Requires an explicit call (the approval). Re-prepares the
   * draft, enforces the gates + optional reviewed-hash match (gate failure or hash drift => NO write),
   * then persists the public-registry CANDIDATE in one transaction:
   *   - `RegistryProfile` status READY (payload = clean artifact, payloadHash = Beacon hash)
   *   - internal DRAFT `TruthPublishRecord` ledger row (version = integer profileVersion)
   * The canon's own publish status is untouched. NO external publish, NO GitHub PR, NO MCP/signal write.
   */
  async approveRegistryPublishDraft(
    canonVersionId: string,
    organizationId: string,
    approval: { approvedBy?: string; expectedContentHash?: string } = {},
  ) {
    const draft = await this.prepareRegistryPublishDraft(canonVersionId, organizationId);
    assertApprovable(draft.packet, approval.expectedContentHash);

    const writes = buildRegistryDraftWrites({
      organizationId,
      companyProfileId: draft.companyProfileId,
      canonVersionId,
      version: draft.profileVersion,
      packet: draft.packet,
      approvedBy: approval.approvedBy,
    });
    const rp = writes.registryProfile;
    const pr = writes.truthPublishRecord;

    return db.$transaction(async (tx) => {
      const registryProfile = await tx.registryProfile.upsert({
        where: rp.where,
        create: { ...rp.create, payload: json(rp.create.payload) },
        update: { ...rp.update, payload: json(rp.update.payload) },
      });
      const publishRecord = await tx.truthPublishRecord.upsert({
        where: pr.where,
        create: { ...pr.create, exportPayload: json(pr.create.exportPayload) },
        update: { ...pr.update, exportPayload: json(pr.update.exportPayload) },
      });
      return { registryProfile, publishRecord, contentHash: draft.packet.contentHash, profileVersion: draft.profileVersion };
    });
  },

  /**
   * ⚠ WRITE METHOD — compatibility alias for the existing `truth-canon/[id]/publish` route.
   * Equivalent to `approveRegistryPublishDraft` with no operator id: it PERSISTS RegistryProfile
   * READY + a DRAFT TruthPublishRecord. NOT a preview — use `prepareRegistryPublishDraft` to
   * review without writing.
   */
  async generateForCanon(canonVersionId: string, organizationId: string) {
    return (await this.approveRegistryPublishDraft(canonVersionId, organizationId)).registryProfile;
  },
};

export const AuthorityArtifactService = {
  async getAuthorityMap(organizationId: string, companyProfileId?: string) {
    const profile = await getPrimaryProfile(organizationId, companyProfileId);
    if (!profile) return null;

    const existing = await db.authoritySource.findMany({
      where: { organizationId, companyProfileId: profile.id },
      orderBy: { createdAt: "asc" },
    });

    if (existing.length > 0) return { companyProfileId: profile.id, sources: existing };

    const defaults = buildDefaultAuthoritySources(profile);
    await db.authoritySource.createMany({ data: defaults });

    return {
      companyProfileId: profile.id,
      sources: await db.authoritySource.findMany({ where: { organizationId, companyProfileId: profile.id } }),
    };
  },

  buildSchemaOrg(canonPayload: CanonPayload) {
    const business = canonPayload.business;
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: business.name,
      url: business.website,
      description: business.description,
      knowsAbout: [...business.services, ...business.industries],
      areaServed: business.locations,
      slogan: business.differentiators[0] ?? undefined,
    };
  },

  async exportArtifacts(canonVersionId: string, organizationId: string, format: "json" | "markdown" | "schemaorg" | "registry") {
    const canon = await db.truthCanonVersion.findFirst({ where: { id: canonVersionId, organizationId } });
    if (!canon) throw new Error("Canon version not found.");

    const payload = canon.canonPayload as CanonPayload;
    if (format === "schemaorg") return this.buildSchemaOrg(payload);
    // WP-19F: the public "registry" export is the clean entity-profile-v1.0 artifact (read-only prepare; no write).
    if (format === "registry") return (await RegistryProfileService.prepareRegistryPublishDraft(canonVersionId, organizationId)).packet.generatedArtifact;
    if (format === "markdown") return toCanonMarkdown(payload);
    return payload;
  },
};

function buildDefaultAuthoritySources(profile: CanonProfile) {
  const base = {
    organizationId: profile.organizationId,
    companyProfileId: profile.id,
  };
  const sources: Array<typeof base & {
    type: EvidenceSourceType;
    name: string;
    url?: string | null;
    status: AuthoritySourceStatus;
    recommendedAction: string;
  }> = [
    {
      ...base,
      type: "WEBSITE",
      name: "Company website",
      url: profile.websiteUrl,
      status: profile.websiteUrl ? "READY" : "PLANNED",
      recommendedAction: "Publish the approved Canon summary and schema.org JSON-LD on the company website.",
    },
    {
      ...base,
      type: "DIRECTORY",
      name: "VizAI Business Registry",
      url: "https://github.com/vizai-io/business-registry",
      status: "READY",
      recommendedAction: "Publish the generated registry entry after Canon approval.",
    },
    {
      ...base,
      type: "SOCIAL_PROFILE",
      name: "LinkedIn company profile",
      status: "PLANNED",
      recommendedAction: "Update LinkedIn description, services, and locations to match the approved Canon.",
    },
  ];

  return sources;
}

function toCanonMarkdown(payload: CanonPayload): string {
  const business = payload.business;
  const lines = [
    `# ${business.name} Truth Canon`,
    "",
    `Schema version: ${payload.schema_version}`,
    "",
    "## Business",
    "",
    business.description ?? "No description recorded.",
    "",
    "## Services",
    "",
    ...(business.services.length ? business.services.map((item) => `- ${item}`) : ["- None recorded"]),
    "",
    "## Locations",
    "",
    ...(business.locations.length ? business.locations.map((item) => `- ${item}`) : ["- None recorded"]),
    "",
    "## Claims",
    "",
    ...(payload.claims.length ? payload.claims.map((claim) => `- ${claim.statement}`) : ["- None recorded"]),
    "",
    "## Evidence",
    "",
    ...(payload.evidence.length ? payload.evidence.map((item) => `- ${item.title}${item.url ? `: ${item.url}` : ""}`) : ["- None recorded"]),
  ];

  return lines.join("\n");
}

export const DriftRunService = {
  async run(organizationId: string, companyProfileId?: string) {
    const profile = await getPrimaryProfile(organizationId, companyProfileId);
    if (!profile) throw new Error("No active company profile found.");

    const canon = await db.truthCanonVersion.findFirst({
      where: { organizationId, companyProfileId: profile.id, status: "PUBLISHED" },
      orderBy: { version: "desc" },
    });
    if (!canon) throw new Error("Publish a Truth Canon before running drift.");

    const latestScan = await db.perceptionScan.findFirst({
      where: { organizationId, companyProfileId: profile.id, status: { in: ["COMPLETE", "PARTIAL"] } },
      orderBy: { createdAt: "desc" },
      include: {
        scanReport: { select: { accuracyScore: true, coverageScore: true, consistencyScore: true } },
        modelResults: {
          where: { success: true },
          select: {
            success: true,
            businessType: true,
            servicesMentioned: true,
            locationsMentioned: true,
            industriesMentioned: true,
            customerTypesMentioned: true,
            differentiatorsMentioned: true,
          },
        },
      },
    });

    const payload = canon.canonPayload as CanonPayload;
    const findings: Array<{ severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"; category: string; title: string; description: string; evidence: Record<string, unknown>; action: string }> = [];

    if (latestScan) {
      const scanInput = PerceptionDriftService.buildScanInput(latestScan);
      const drift = PerceptionDriftService.classify(payload.business, scanInput);
      for (const signal of drift.signals) {
        findings.push({
          severity: signal.severity,
          category: signal.type,
          title: signal.what.slice(0, 180),
          description: `${signal.why} ${signal.impact}`,
          evidence: { affectedItems: signal.affectedItems, scanId: latestScan.id },
          action: signal.action,
        });
      }
    } else {
      findings.push({
        severity: "MODERATE",
        category: "NO_SCAN",
        title: "No completed perception scan is available for this Canon.",
        description: "VizAI cannot compare AI perception against the approved Canon until a scan has completed.",
        evidence: {},
        action: "Run a perception scan for this company profile.",
      });
    }

    const authorityCount = await db.authoritySource.count({ where: { organizationId, companyProfileId: profile.id } });
    if (authorityCount === 0) {
      findings.push({
        severity: "LOW",
        category: "AUTHORITY_MAP_MISSING",
        title: "No authority map has been generated.",
        description: "The Canon has not yet been translated into publication targets.",
        evidence: {},
        action: "Generate the authority map and publish the approved artifacts manually.",
      });
    }

    const overallSeverity = maxSeverity(findings.map((finding) => finding.severity));
    const run = await db.driftRun.create({
      data: {
        organizationId,
        companyProfileId: profile.id,
        canonVersionId: canon.id,
        perceptionScanId: latestScan?.id ?? null,
        status: latestScan ? "COMPLETE" : "PARTIAL",
        overallSeverity,
        summary: findings.length === 0 ? "No drift findings detected." : `${findings.length} drift finding(s) detected.`,
          metadata: json({ canonVersion: canon.version }),
        findings: { create: findings.map((finding) => ({ ...finding, evidence: json(finding.evidence) })) },
      },
      include: { findings: true },
    });

    return run;
  },

  async list(organizationId: string, companyProfileId?: string) {
    return db.driftRun.findMany({
      where: { organizationId, ...(companyProfileId ? { companyProfileId } : {}) },
      include: { findings: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  },
};

function maxSeverity(severities: Array<"LOW" | "MODERATE" | "HIGH" | "CRITICAL">) {
  if (severities.includes("CRITICAL")) return "CRITICAL";
  if (severities.includes("HIGH")) return "HIGH";
  if (severities.includes("MODERATE")) return "MODERATE";
  if (severities.includes("LOW")) return "LOW";
  return null;
}
