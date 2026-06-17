-- Phase 0-1 truth infrastructure substrate.
-- Adds evidence-backed Canon versions, graph entities/edges, registry profiles,
-- authority sources, and persisted drift runs.

CREATE TYPE "TruthCanonStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "TruthEntityType" AS ENUM ('COMPANY', 'BRAND', 'SERVICE', 'PRODUCT', 'LOCATION', 'INDUSTRY', 'CERTIFICATION', 'CLAIM', 'EVIDENCE', 'AUTHORITY_SOURCE', 'COMPETITOR', 'CUSTOMER_SEGMENT', 'PERSON', 'REGISTRY_PROFILE');
CREATE TYPE "TruthClaimStatus" AS ENUM ('DRAFT', 'VERIFIED', 'NEEDS_EVIDENCE', 'REJECTED', 'ARCHIVED');
CREATE TYPE "EvidenceSourceType" AS ENUM ('WEBSITE', 'SOCIAL_PROFILE', 'DIRECTORY', 'GOVERNMENT_RECORD', 'TRADE_ASSOCIATION', 'REVIEW_PLATFORM', 'PRESS', 'CUSTOMER_PROVIDED', 'OTHER');
CREATE TYPE "EvidenceSupportLevel" AS ENUM ('STRONG', 'MODERATE', 'WEAK', 'CONTRADICTS');
CREATE TYPE "TruthGraphRelationType" AS ENUM ('PROVIDES', 'OPERATES_IN', 'SERVES', 'CERTIFIED_BY', 'SUPPORTED_BY', 'LISTED_ON', 'COMPETES_WITH', 'DERIVED_FROM', 'CONTACT_FOR', 'HAS_BRAND');
CREATE TYPE "RegistryProfileStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "AuthoritySourceStatus" AS ENUM ('PLANNED', 'READY', 'PUBLISHED', 'NEEDS_UPDATE', 'BLOCKED');
CREATE TYPE "DriftRunStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'FAILED');
CREATE TYPE "DriftFindingSeverity" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

CREATE TABLE "truth_canon_versions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "TruthCanonStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "canonPayload" JSONB NOT NULL DEFAULT '{}',
  "payloadHash" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "truth_canon_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "truth_entities" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "canonVersionId" TEXT,
  "type" "TruthEntityType" NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "data" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "truth_entities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "truth_claims" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "canonVersionId" TEXT,
  "entityId" TEXT,
  "category" TEXT NOT NULL,
  "statement" TEXT NOT NULL,
  "value" JSONB NOT NULL DEFAULT '{}',
  "status" "TruthClaimStatus" NOT NULL DEFAULT 'DRAFT',
  "confidence" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "truth_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evidence_sources" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "type" "EvidenceSourceType" NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "sourceDate" TIMESTAMP(3),
  "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contentHash" TEXT,
  "evidenceText" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evidence_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "truth_claim_evidence" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "evidenceSourceId" TEXT NOT NULL,
  "supportLevel" "EvidenceSupportLevel" NOT NULL DEFAULT 'MODERATE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "truth_claim_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "truth_graph_edges" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "fromEntityId" TEXT NOT NULL,
  "toEntityId" TEXT NOT NULL,
  "relationType" "TruthGraphRelationType" NOT NULL,
  "claimId" TEXT,
  "weight" INTEGER NOT NULL DEFAULT 100,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "truth_graph_edges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "registry_profiles" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "canonVersionId" TEXT,
  "registryId" TEXT NOT NULL,
  "status" "RegistryProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "payload" JSONB NOT NULL DEFAULT '{}',
  "payloadHash" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "registry_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "authority_sources" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "type" "EvidenceSourceType" NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "status" "AuthoritySourceStatus" NOT NULL DEFAULT 'PLANNED',
  "recommendedAction" TEXT,
  "lastCheckedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "authority_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drift_runs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "canonVersionId" TEXT,
  "perceptionScanId" TEXT,
  "status" "DriftRunStatus" NOT NULL DEFAULT 'COMPLETE',
  "overallSeverity" "DriftFindingSeverity",
  "summary" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drift_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drift_findings" (
  "id" TEXT NOT NULL,
  "driftRunId" TEXT NOT NULL,
  "severity" "DriftFindingSeverity" NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drift_findings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "truth_canon_versions_companyProfileId_version_key" ON "truth_canon_versions"("companyProfileId", "version");
CREATE INDEX "truth_canon_versions_organizationId_status_idx" ON "truth_canon_versions"("organizationId", "status");
CREATE INDEX "truth_canon_versions_companyProfileId_status_idx" ON "truth_canon_versions"("companyProfileId", "status");

CREATE UNIQUE INDEX "truth_entities_organizationId_companyProfileId_type_slug_key" ON "truth_entities"("organizationId", "companyProfileId", "type", "slug");
CREATE INDEX "truth_entities_organizationId_type_idx" ON "truth_entities"("organizationId", "type");
CREATE INDEX "truth_entities_companyProfileId_idx" ON "truth_entities"("companyProfileId");

CREATE INDEX "truth_claims_organizationId_status_idx" ON "truth_claims"("organizationId", "status");
CREATE INDEX "truth_claims_companyProfileId_category_idx" ON "truth_claims"("companyProfileId", "category");
CREATE INDEX "truth_claims_canonVersionId_idx" ON "truth_claims"("canonVersionId");

CREATE INDEX "evidence_sources_organizationId_type_idx" ON "evidence_sources"("organizationId", "type");
CREATE INDEX "evidence_sources_companyProfileId_idx" ON "evidence_sources"("companyProfileId");
CREATE INDEX "evidence_sources_url_idx" ON "evidence_sources"("url");

CREATE UNIQUE INDEX "truth_claim_evidence_claimId_evidenceSourceId_key" ON "truth_claim_evidence"("claimId", "evidenceSourceId");
CREATE INDEX "truth_claim_evidence_evidenceSourceId_idx" ON "truth_claim_evidence"("evidenceSourceId");

CREATE UNIQUE INDEX "truth_graph_edges_organizationId_companyProfileId_fromEntityId_toEntityId_relationType_key" ON "truth_graph_edges"("organizationId", "companyProfileId", "fromEntityId", "toEntityId", "relationType");
CREATE INDEX "truth_graph_edges_organizationId_relationType_idx" ON "truth_graph_edges"("organizationId", "relationType");
CREATE INDEX "truth_graph_edges_companyProfileId_idx" ON "truth_graph_edges"("companyProfileId");

CREATE INDEX "registry_profiles_organizationId_status_idx" ON "registry_profiles"("organizationId", "status");
CREATE INDEX "registry_profiles_companyProfileId_idx" ON "registry_profiles"("companyProfileId");
CREATE UNIQUE INDEX "registry_profiles_organizationId_registryId_key" ON "registry_profiles"("organizationId", "registryId");

CREATE INDEX "authority_sources_organizationId_status_idx" ON "authority_sources"("organizationId", "status");
CREATE INDEX "authority_sources_companyProfileId_type_idx" ON "authority_sources"("companyProfileId", "type");

CREATE INDEX "drift_runs_organizationId_createdAt_idx" ON "drift_runs"("organizationId", "createdAt");
CREATE INDEX "drift_runs_companyProfileId_idx" ON "drift_runs"("companyProfileId");
CREATE INDEX "drift_findings_driftRunId_severity_idx" ON "drift_findings"("driftRunId", "severity");

ALTER TABLE "truth_canon_versions" ADD CONSTRAINT "truth_canon_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_canon_versions" ADD CONSTRAINT "truth_canon_versions_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "truth_entities" ADD CONSTRAINT "truth_entities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_entities" ADD CONSTRAINT "truth_entities_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_entities" ADD CONSTRAINT "truth_entities_canonVersionId_fkey" FOREIGN KEY ("canonVersionId") REFERENCES "truth_canon_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "truth_claims" ADD CONSTRAINT "truth_claims_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_claims" ADD CONSTRAINT "truth_claims_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_claims" ADD CONSTRAINT "truth_claims_canonVersionId_fkey" FOREIGN KEY ("canonVersionId") REFERENCES "truth_canon_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "truth_claims" ADD CONSTRAINT "truth_claims_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "truth_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "truth_claim_evidence" ADD CONSTRAINT "truth_claim_evidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "truth_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_claim_evidence" ADD CONSTRAINT "truth_claim_evidence_evidenceSourceId_fkey" FOREIGN KEY ("evidenceSourceId") REFERENCES "evidence_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "truth_graph_edges" ADD CONSTRAINT "truth_graph_edges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_graph_edges" ADD CONSTRAINT "truth_graph_edges_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_graph_edges" ADD CONSTRAINT "truth_graph_edges_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "truth_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truth_graph_edges" ADD CONSTRAINT "truth_graph_edges_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "truth_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registry_profiles" ADD CONSTRAINT "registry_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_profiles" ADD CONSTRAINT "registry_profiles_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_profiles" ADD CONSTRAINT "registry_profiles_canonVersionId_fkey" FOREIGN KEY ("canonVersionId") REFERENCES "truth_canon_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "authority_sources" ADD CONSTRAINT "authority_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authority_sources" ADD CONSTRAINT "authority_sources_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "drift_runs" ADD CONSTRAINT "drift_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drift_runs" ADD CONSTRAINT "drift_runs_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drift_runs" ADD CONSTRAINT "drift_runs_canonVersionId_fkey" FOREIGN KEY ("canonVersionId") REFERENCES "truth_canon_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "drift_findings" ADD CONSTRAINT "drift_findings_driftRunId_fkey" FOREIGN KEY ("driftRunId") REFERENCES "drift_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
