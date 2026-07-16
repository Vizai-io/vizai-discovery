-- WP-VIZ-CRAWL-01: additive Registry Intelligence foundation.
-- No existing truth, profile, scan, or publication records are modified.

CREATE TYPE "RegistryTargetStatus" AS ENUM ('NEW', 'RESOLVING', 'ACTIVE', 'PAUSED', 'QUARANTINED', 'ARCHIVED');
CREATE TYPE "RegistryAutonomyLevel" AS ENUM ('MANUAL', 'SUPERVISED', 'AUTO_DISCOVERY', 'POLICY_AUTO_VERIFY', 'POLICY_AUTO_PUBLISH');
CREATE TYPE "CrawlRunStatus" AS ENUM ('QUEUED', 'PLANNING', 'CRAWLING', 'EXTRACTING', 'ASSESSING', 'PAUSED', 'COMPLETE', 'PARTIAL', 'FAILED', 'CANCELLED');
CREATE TYPE "CrawlTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'BLOCKED', 'RETRY', 'FAILED', 'CANCELLED');
CREATE TYPE "CrawlTransport" AS ENUM ('STATIC_HTTP', 'BROWSER');
CREATE TYPE "RobotsDecision" AS ENUM ('ALLOWED', 'DISALLOWED', 'UNAVAILABLE', 'UNREACHABLE', 'ERROR');
CREATE TYPE "CrawlStopReason" AS ENUM ('FOUNDATION_FETCH_COMPLETE', 'ROBOTS_BLOCKED', 'POLICY_BLOCKED', 'BUDGET_EXHAUSTED', 'OPERATOR_PAUSED', 'OPERATOR_CANCELLED', 'FETCH_FAILED', 'INTERNAL_ERROR');

ALTER TABLE "service_api_keys" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "registry_autonomy_policies" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "level" "RegistryAutonomyLevel" NOT NULL DEFAULT 'MANUAL',
  "maySchedule" BOOLEAN NOT NULL DEFAULT false,
  "mayDiscoverSources" BOOLEAN NOT NULL DEFAULT false,
  "mayUseBrowser" BOOLEAN NOT NULL DEFAULT false,
  "mayCreateEvidence" BOOLEAN NOT NULL DEFAULT true,
  "mayCreateClaimCandidates" BOOLEAN NOT NULL DEFAULT false,
  "mayVerifyObservedClaims" BOOLEAN NOT NULL DEFAULT false,
  "maySetPublishAllowed" BOOLEAN NOT NULL DEFAULT false,
  "mayPrepareRegistry" BOOLEAN NOT NULL DEFAULT false,
  "mayCreatePullRequest" BOOLEAN NOT NULL DEFAULT false,
  "mayMergePullRequest" BOOLEAN NOT NULL DEFAULT false,
  "allowedSourceClasses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowedClaimCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "budgets" JSONB NOT NULL DEFAULT '{}',
  "thresholds" JSONB NOT NULL DEFAULT '{}',
  "canaryPercentage" INTEGER NOT NULL DEFAULT 0,
  "policyHash" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registry_autonomy_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registry_autonomy_policies_canary_check" CHECK ("canaryPercentage" BETWEEN 0 AND 100)
);

CREATE TABLE "registry_targets" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyProfileId" TEXT,
  "autonomyPolicyId" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "canonicalDomain" TEXT NOT NULL,
  "status" "RegistryTargetStatus" NOT NULL DEFAULT 'NEW',
  "entityResolutionState" TEXT NOT NULL DEFAULT 'UNRESOLVED',
  "entityConfidence" INTEGER,
  "freshnessHours" INTEGER NOT NULL DEFAULT 720,
  "lastCrawledAt" TIMESTAMP(3),
  "nextCrawlAt" TIMESTAMP(3),
  "quarantineReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "registry_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registry_targets_entity_confidence_check" CHECK ("entityConfidence" IS NULL OR "entityConfidence" BETWEEN 0 AND 100),
  CONSTRAINT "registry_targets_freshness_check" CHECK ("freshnessHours" BETWEEN 1 AND 8760)
);

CREATE TABLE "registry_crawl_runs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "autonomyPolicyId" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL DEFAULT 'MANUAL',
  "triggeredBy" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "status" "CrawlRunStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "policyHash" TEXT NOT NULL,
  "plannerVersion" TEXT,
  "extractorVersion" TEXT,
  "schemaVersion" TEXT NOT NULL DEFAULT '1',
  "traceId" TEXT NOT NULL,
  "commandCenterRunId" TEXT,
  "queueJobId" TEXT,
  "budgetAllocated" JSONB NOT NULL DEFAULT '{}',
  "budgetConsumed" JSONB NOT NULL DEFAULT '{}',
  "coverageBefore" JSONB NOT NULL DEFAULT '{}',
  "coverageAfter" JSONB NOT NULL DEFAULT '{}',
  "stopReason" "CrawlStopReason",
  "summary" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "registry_crawl_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "registry_crawl_tasks" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "normalizedUrl" TEXT NOT NULL,
  "urlHash" TEXT NOT NULL,
  "sourceClass" TEXT NOT NULL DEFAULT 'FIRST_PARTY',
  "purpose" TEXT NOT NULL DEFAULT 'FOUNDATION_FETCH',
  "depth" INTEGER NOT NULL DEFAULT 0,
  "parentUrl" TEXT,
  "requestedTransport" "CrawlTransport" NOT NULL DEFAULT 'STATIC_HTTP',
  "actualTransport" "CrawlTransport",
  "status" "CrawlTaskStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "robotsDecision" "RobotsDecision",
  "eligibilityReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "registry_crawl_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "registry_page_snapshots" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "crawlTaskId" TEXT,
  "normalizedUrl" TEXT NOT NULL,
  "urlHash" TEXT NOT NULL,
  "finalUrl" TEXT NOT NULL,
  "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceDate" TIMESTAMP(3),
  "httpStatus" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "textHash" TEXT,
  "objectKey" TEXT,
  "normalizedTextObjectKey" TEXT,
  "redirectChain" JSONB NOT NULL DEFAULT '[]',
  "robotsDecision" "RobotsDecision" NOT NULL,
  "fetchMetadata" JSONB NOT NULL DEFAULT '{}',
  "parserVersion" TEXT NOT NULL DEFAULT 'foundation-v1',
  "retentionClass" TEXT NOT NULL DEFAULT 'STANDARD',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registry_page_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registry_page_snapshots_size_check" CHECK ("sizeBytes" >= 0)
);

CREATE TABLE "registry_agent_decisions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "crawlTaskId" TEXT,
  "step" TEXT NOT NULL,
  "decisionType" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}',
  "rationale" TEXT NOT NULL,
  "ruleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "modelProvider" TEXT,
  "modelName" TEXT,
  "modelVersion" TEXT,
  "promptTemplateHash" TEXT,
  "policyHash" TEXT NOT NULL,
  "traceId" TEXT NOT NULL,
  "costMicros" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registry_agent_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registry_autonomy_policies_org_name_version_key" ON "registry_autonomy_policies"("organizationId", "name", "version");
CREATE UNIQUE INDEX "registry_autonomy_policies_org_hash_key" ON "registry_autonomy_policies"("organizationId", "policyHash");
CREATE INDEX "registry_autonomy_policies_org_active_idx" ON "registry_autonomy_policies"("organizationId", "isActive");
CREATE UNIQUE INDEX "registry_targets_org_domain_key" ON "registry_targets"("organizationId", "canonicalDomain");
CREATE INDEX "registry_targets_org_status_idx" ON "registry_targets"("organizationId", "status");
CREATE INDEX "registry_targets_company_idx" ON "registry_targets"("companyProfileId");
CREATE INDEX "registry_targets_next_crawl_idx" ON "registry_targets"("nextCrawlAt");
CREATE UNIQUE INDEX "registry_crawl_runs_trace_key" ON "registry_crawl_runs"("traceId");
CREATE UNIQUE INDEX "registry_crawl_runs_queue_job_key" ON "registry_crawl_runs"("queueJobId");
CREATE INDEX "registry_crawl_runs_org_status_idx" ON "registry_crawl_runs"("organizationId", "status");
CREATE INDEX "registry_crawl_runs_target_created_idx" ON "registry_crawl_runs"("targetId", "createdAt" DESC);
CREATE INDEX "registry_crawl_runs_status_priority_created_idx" ON "registry_crawl_runs"("status", "priority", "createdAt");
CREATE UNIQUE INDEX "registry_crawl_tasks_idempotency_key" ON "registry_crawl_tasks"("idempotencyKey");
CREATE UNIQUE INDEX "registry_crawl_tasks_run_url_purpose_key" ON "registry_crawl_tasks"("runId", "urlHash", "purpose");
CREATE INDEX "registry_crawl_tasks_org_status_idx" ON "registry_crawl_tasks"("organizationId", "status");
CREATE INDEX "registry_crawl_tasks_run_status_idx" ON "registry_crawl_tasks"("runId", "status");
CREATE UNIQUE INDEX "registry_page_snapshots_target_url_content_key" ON "registry_page_snapshots"("targetId", "urlHash", "contentHash");
CREATE INDEX "registry_page_snapshots_org_retrieved_idx" ON "registry_page_snapshots"("organizationId", "retrievedAt");
CREATE INDEX "registry_page_snapshots_run_idx" ON "registry_page_snapshots"("runId");
CREATE INDEX "registry_page_snapshots_content_hash_idx" ON "registry_page_snapshots"("contentHash");
CREATE INDEX "registry_agent_decisions_org_created_idx" ON "registry_agent_decisions"("organizationId", "createdAt");
CREATE INDEX "registry_agent_decisions_run_created_idx" ON "registry_agent_decisions"("runId", "createdAt");
CREATE INDEX "registry_agent_decisions_trace_idx" ON "registry_agent_decisions"("traceId");

ALTER TABLE "registry_autonomy_policies" ADD CONSTRAINT "registry_autonomy_policies_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_targets" ADD CONSTRAINT "registry_targets_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_targets" ADD CONSTRAINT "registry_targets_company_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registry_targets" ADD CONSTRAINT "registry_targets_policy_fkey" FOREIGN KEY ("autonomyPolicyId") REFERENCES "registry_autonomy_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "registry_crawl_runs" ADD CONSTRAINT "registry_crawl_runs_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_crawl_runs" ADD CONSTRAINT "registry_crawl_runs_target_fkey" FOREIGN KEY ("targetId") REFERENCES "registry_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_crawl_runs" ADD CONSTRAINT "registry_crawl_runs_policy_fkey" FOREIGN KEY ("autonomyPolicyId") REFERENCES "registry_autonomy_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "registry_crawl_tasks" ADD CONSTRAINT "registry_crawl_tasks_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_crawl_tasks" ADD CONSTRAINT "registry_crawl_tasks_run_fkey" FOREIGN KEY ("runId") REFERENCES "registry_crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_page_snapshots" ADD CONSTRAINT "registry_page_snapshots_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_page_snapshots" ADD CONSTRAINT "registry_page_snapshots_target_fkey" FOREIGN KEY ("targetId") REFERENCES "registry_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_page_snapshots" ADD CONSTRAINT "registry_page_snapshots_run_fkey" FOREIGN KEY ("runId") REFERENCES "registry_crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_page_snapshots" ADD CONSTRAINT "registry_page_snapshots_task_fkey" FOREIGN KEY ("crawlTaskId") REFERENCES "registry_crawl_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registry_agent_decisions" ADD CONSTRAINT "registry_agent_decisions_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_agent_decisions" ADD CONSTRAINT "registry_agent_decisions_target_fkey" FOREIGN KEY ("targetId") REFERENCES "registry_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_agent_decisions" ADD CONSTRAINT "registry_agent_decisions_run_fkey" FOREIGN KEY ("runId") REFERENCES "registry_crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registry_agent_decisions" ADD CONSTRAINT "registry_agent_decisions_task_fkey" FOREIGN KEY ("crawlTaskId") REFERENCES "registry_crawl_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
