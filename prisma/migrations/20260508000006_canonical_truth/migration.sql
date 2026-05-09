-- Migration: Canonical truth publishing infrastructure
-- Phase 2.2 — Canonical Truth + Drift Operations

-- Add GitHub publishing fields to organizations (optional, push-only)
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "githubRepoUrl"       TEXT,
  ADD COLUMN IF NOT EXISTS "githubDefaultBranch" TEXT;

-- New enum for truth publish status
CREATE TYPE "TruthPublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- New table: canonical truth publish records (audit trail)
CREATE TABLE "truth_publish_records" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "companyProfileId" TEXT NOT NULL,
  "version"          INTEGER NOT NULL,
  "status"           "TruthPublishStatus" NOT NULL DEFAULT 'DRAFT',
  "exportPayload"    JSONB NOT NULL,
  "payloadHash"      TEXT NOT NULL,
  "publishedAt"      TIMESTAMP(3),
  "confirmedAt"      TIMESTAMP(3),
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "truth_publish_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "truth_publish_records_companyProfileId_version_key"
    UNIQUE ("companyProfileId", "version"),
  CONSTRAINT "truth_publish_records_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "truth_publish_records_companyProfileId_fkey"
    FOREIGN KEY ("companyProfileId")
    REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "truth_publish_records_organizationId_idx"
  ON "truth_publish_records"("organizationId");
CREATE INDEX "truth_publish_records_companyProfileId_status_idx"
  ON "truth_publish_records"("companyProfileId", "status");
