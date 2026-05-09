-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrgTier" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CLIENT');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'NOT_MENTIONED');

-- CreateEnum
CREATE TYPE "OmissionSeverity" AS ENUM ('MAJOR', 'MINOR');

-- CreateEnum
CREATE TYPE "ConsistencyLabel" AS ENUM ('HIGH_AGREEMENT', 'MODERATE_DIVERGENCE', 'SIGNIFICANT_DIVERGENCE', 'EXTREME_DIVERGENCE');

-- CreateEnum
CREATE TYPE "RecurrenceInterval" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tier" "OrgTier" NOT NULL DEFAULT 'STARTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "adminEmail" TEXT,
    "logoUrl" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "organizationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "officialDescription" TEXT,
    "officialBusinessType" TEXT,
    "officialServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "officialLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "officialIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "officialDifferentiators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "officialCustomerTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perception_scans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyProfileId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "promptUsed" TEXT NOT NULL,
    "modelsRequested" TEXT[],
    "currentStep" TEXT,
    "errorMessage" TEXT,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perception_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_results" (
    "id" TEXT NOT NULL,
    "perceptionScanId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "rawResponse" TEXT,
    "summary" TEXT,
    "businessDescription" TEXT,
    "businessType" TEXT,
    "servicesMentioned" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "industriesMentioned" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locationsMentioned" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerTypesMentioned" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "differentiatorsMentioned" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "additionalClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_reports" (
    "id" TEXT NOT NULL,
    "perceptionScanId" TEXT NOT NULL,
    "perceptionSummary" TEXT NOT NULL,
    "agreements" JSONB NOT NULL DEFAULT '[]',
    "differences" JSONB NOT NULL DEFAULT '[]',
    "conflicts" JSONB NOT NULL DEFAULT '[]',
    "accuracyScore" INTEGER NOT NULL DEFAULT 100,
    "coverageScore" INTEGER NOT NULL DEFAULT 100,
    "entityUnderstandingScore" INTEGER NOT NULL DEFAULT 0,
    "consistencyScore" INTEGER NOT NULL DEFAULT 0,
    "consistencyLabel" "ConsistencyLabel" NOT NULL DEFAULT 'HIGH_AGREEMENT',
    "consistencyNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inaccuracyDetail" JSONB NOT NULL DEFAULT '{}',
    "omissionDetail" JSONB NOT NULL DEFAULT '{}',
    "entityUnderstanding" JSONB NOT NULL DEFAULT '{}',
    "markdownReport" TEXT,
    "jsonReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "perceptionScanId" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "serviceLink" TEXT,
    "isActioned" BOOLEAN NOT NULL DEFAULT false,
    "actionedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyProfileId" TEXT,
    "businessName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "message" TEXT NOT NULL,
    "serviceInterest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_query_libraries" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "promptTemplate" TEXT NOT NULL,
    "exampleBusinesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_query_libraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyProfileId" TEXT NOT NULL,
    "interval" "RecurrenceInterval" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "modelsToUse" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_embeddings" (
    "id" TEXT NOT NULL,
    "perceptionScanId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "company_profiles_organizationId_idx" ON "company_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "company_profiles_businessName_idx" ON "company_profiles"("businessName");

-- CreateIndex
CREATE INDEX "perception_scans_organizationId_idx" ON "perception_scans"("organizationId");

-- CreateIndex
CREATE INDEX "perception_scans_companyProfileId_idx" ON "perception_scans"("companyProfileId");

-- CreateIndex
CREATE INDEX "perception_scans_status_idx" ON "perception_scans"("status");

-- CreateIndex
CREATE INDEX "perception_scans_createdAt_idx" ON "perception_scans"("createdAt");

-- CreateIndex
CREATE INDEX "model_results_perceptionScanId_idx" ON "model_results"("perceptionScanId");

-- CreateIndex
CREATE UNIQUE INDEX "scan_reports_perceptionScanId_key" ON "scan_reports"("perceptionScanId");

-- CreateIndex
CREATE INDEX "recommendations_perceptionScanId_idx" ON "recommendations"("perceptionScanId");

-- CreateIndex
CREATE INDEX "recommendations_priority_idx" ON "recommendations"("priority");

-- CreateIndex
CREATE INDEX "competitor_profiles_organizationId_idx" ON "competitor_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "consultation_requests_organizationId_idx" ON "consultation_requests"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "industry_query_libraries_industry_key" ON "industry_query_libraries"("industry");

-- CreateIndex
CREATE INDEX "scan_schedules_organizationId_idx" ON "scan_schedules"("organizationId");

-- CreateIndex
CREATE INDEX "scan_schedules_nextRunAt_idx" ON "scan_schedules"("nextRunAt");

-- CreateIndex
CREATE INDEX "scan_embeddings_perceptionScanId_idx" ON "scan_embeddings"("perceptionScanId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perception_scans" ADD CONSTRAINT "perception_scans_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_results" ADD CONSTRAINT "model_results_perceptionScanId_fkey" FOREIGN KEY ("perceptionScanId") REFERENCES "perception_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_reports" ADD CONSTRAINT "scan_reports_perceptionScanId_fkey" FOREIGN KEY ("perceptionScanId") REFERENCES "perception_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_perceptionScanId_fkey" FOREIGN KEY ("perceptionScanId") REFERENCES "perception_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_profiles" ADD CONSTRAINT "competitor_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_profiles" ADD CONSTRAINT "competitor_profiles_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_embeddings" ADD CONSTRAINT "scan_embeddings_perceptionScanId_fkey" FOREIGN KEY ("perceptionScanId") REFERENCES "perception_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
