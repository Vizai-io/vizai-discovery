import crypto from "node:crypto";
import {
  Prisma,
  type CrawlRunStatus,
  type RegistryAutonomyPolicy,
  type RegistryCrawlRun,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  EVENT_SOURCES,
  EVENT_TYPES,
  OperationalEventService,
  SEVERITIES,
} from "@/lib/services/operational-event-service";
import { FOUNDATION_BUDGET } from "./contracts";
import { hashCanonicalJson } from "./canonical-json";
import { getRegistryQueue } from "./queue";
import { assertRunTransition } from "./run-state-machine";
import { normalizeHostname, normalizeUrl, validateUrlStructure } from "./url-policy";

const ACTIVE_RUN_STATUSES: CrawlRunStatus[] = [
  "QUEUED", "PLANNING", "CRAWLING", "EXTRACTING", "ASSESSING", "PAUSED",
];

const DEFAULT_POLICY = {
  name: "Foundation supervised",
  version: 1,
  level: "SUPERVISED" as const,
  maySchedule: false,
  mayDiscoverSources: false,
  mayUseBrowser: false,
  mayCreateEvidence: true,
  mayCreateClaimCandidates: false,
  mayVerifyObservedClaims: false,
  maySetPublishAllowed: false,
  mayPrepareRegistry: false,
  mayCreatePullRequest: false,
  mayMergePullRequest: false,
  allowedSourceClasses: ["FIRST_PARTY"],
  allowedClaimCategories: [] as string[],
  budgets: FOUNDATION_BUDGET,
  thresholds: { stopOnRobotsFailure: true },
  canaryPercentage: 0,
};

function policyHash(policy: typeof DEFAULT_POLICY): string {
  return hashCanonicalJson(policy);
}

export async function ensureFoundationPolicy(organizationId: string): Promise<RegistryAutonomyPolicy> {
  const hash = policyHash(DEFAULT_POLICY);
  const existing = await db.registryAutonomyPolicy.findFirst({
    where: { organizationId, policyHash: hash },
  });
  if (existing) return existing;

  try {
    return await db.registryAutonomyPolicy.create({
      data: {
        organizationId,
        ...DEFAULT_POLICY,
        budgets: DEFAULT_POLICY.budgets as Prisma.InputJsonValue,
        thresholds: DEFAULT_POLICY.thresholds as Prisma.InputJsonValue,
        policyHash: hash,
        isActive: true,
        approvedBy: "system:wp-viz-crawl-01",
        approvedAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await db.registryAutonomyPolicy.findFirst({ where: { organizationId, policyHash: hash } });
      if (raced) return raced;
    }
    throw error;
  }
}

export interface CreateTargetInput {
  businessName: string;
  canonicalUrl: string;
  companyProfileId?: string;
  autonomyPolicyId?: string;
  freshnessHours: number;
}

export async function createRegistryTarget(organizationId: string, input: CreateTargetInput) {
  const normalized = normalizeUrl(input.canonicalUrl);
  const canonicalDomain = normalizeHostname(new URL(normalized).hostname);
  validateUrlStructure(normalized, { allowedDomains: [canonicalDomain] });

  if (input.companyProfileId) {
    const profile = await db.companyProfile.findFirst({
      where: { id: input.companyProfileId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!profile) throw new Error("Company profile not found or access denied.");
  }

  const policy = input.autonomyPolicyId
    ? await db.registryAutonomyPolicy.findFirst({
        where: { id: input.autonomyPolicyId, organizationId },
      })
    : await ensureFoundationPolicy(organizationId);
  if (!policy) throw new Error("Autonomy policy not found or access denied.");

  const existing = await db.registryTarget.findUnique({
    where: { organizationId_canonicalDomain: { organizationId, canonicalDomain } },
    include: { autonomyPolicy: true },
  });
  if (existing) return { target: existing, created: false };

  const target = await db.registryTarget.create({
    data: {
      organizationId,
      companyProfileId: input.companyProfileId,
      autonomyPolicyId: policy.id,
      businessName: input.businessName,
      canonicalUrl: normalized,
      canonicalDomain,
      freshnessHours: input.freshnessHours,
      status: "ACTIVE",
      entityResolutionState: input.companyProfileId ? "LINKED_PROFILE" : "PROVISIONAL_DOMAIN",
      entityConfidence: input.companyProfileId ? 100 : null,
    },
    include: { autonomyPolicy: true },
  });

  void OperationalEventService.emit({
    eventType: EVENT_TYPES.REGISTRY_TARGET_CREATED,
    severity: SEVERITIES.INFO,
    source: EVENT_SOURCES.REGISTRY_INTELLIGENCE_API,
    traceId: crypto.randomUUID(),
    organizationId,
    entityType: "registry_target",
    entityId: target.id,
    message: `Registry Intelligence target created for ${target.canonicalDomain}`,
    metadata: { canonicalDomain, autonomyPolicyId: policy.id },
  });
  return { target, created: true };
}

export async function listRegistryTargets(organizationId: string) {
  return db.registryTarget.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    include: {
      autonomyPolicy: true,
      crawlRuns: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function createCrawlRun(input: {
  organizationId: string;
  targetId: string;
  triggeredBy: string;
  objective: string;
  priority: number;
  commandCenterRunId?: string;
}) {
  const target = await db.registryTarget.findFirst({
    where: { id: input.targetId, organizationId: input.organizationId },
    include: { autonomyPolicy: true },
  });
  if (!target) throw new Error("Registry target not found or access denied.");
  if (["PAUSED", "QUARANTINED", "ARCHIVED"].includes(target.status)) {
    throw new Error(`Registry target is ${target.status.toLowerCase()} and cannot start a run.`);
  }

  const active = await db.registryCrawlRun.findFirst({
    where: { targetId: target.id, status: { in: ACTIVE_RUN_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
  if (active) return { run: active, created: false };

  const traceId = crypto.randomUUID();
  const queueJobId = crypto.randomUUID();
  let run: RegistryCrawlRun;
  try {
    run = await db.registryCrawlRun.create({
      data: {
        organizationId: input.organizationId,
        targetId: target.id,
        autonomyPolicyId: target.autonomyPolicyId,
        triggeredBy: input.triggeredBy,
        objective: input.objective,
        priority: input.priority,
        policyHash: target.autonomyPolicy.policyHash,
        traceId,
        queueJobId,
        commandCenterRunId: input.commandCenterRunId,
        budgetAllocated: target.autonomyPolicy.budgets as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await db.registryCrawlRun.findFirst({
        where: { targetId: target.id, status: { in: ACTIVE_RUN_STATUSES } },
        orderBy: { createdAt: "desc" },
      });
      if (raced) return { run: raced, created: false };
    }
    throw error;
  }

  try {
    await getRegistryQueue().enqueueRun({
      runId: run.id,
      targetId: target.id,
      organizationId: input.organizationId,
      traceId,
    }, input.priority, queueJobId);
    void OperationalEventService.emit({
      eventType: EVENT_TYPES.REGISTRY_CRAWL_RUN_PLANNED,
      severity: SEVERITIES.INFO,
      source: EVENT_SOURCES.REGISTRY_INTELLIGENCE_API,
      traceId,
      organizationId: input.organizationId,
      entityType: "registry_crawl_run",
      entityId: run.id,
      message: `Registry foundation run queued for ${target.canonicalDomain}`,
      metadata: { targetId: target.id, queueJobId, policyHash: target.autonomyPolicy.policyHash },
    });
    return { run, created: true };
  } catch (error) {
    await db.registryCrawlRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        stopReason: "INTERNAL_ERROR",
        errorCode: "QUEUE_ENQUEUE_FAILED",
        errorMessage: error instanceof Error ? error.message : "Queue enqueue failed",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function getCrawlRun(organizationId: string, runId: string) {
  return db.registryCrawlRun.findFirst({
    where: { id: runId, organizationId },
    include: {
      target: { select: { id: true, businessName: true, canonicalDomain: true, canonicalUrl: true } },
      tasks: { orderBy: { createdAt: "asc" } },
      pageSnapshots: { orderBy: { retrievedAt: "desc" } },
      agentDecisions: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function transitionCrawlRun(
  organizationId: string,
  runId: string,
  to: CrawlRunStatus,
  data: Prisma.RegistryCrawlRunUpdateManyMutationInput = {},
) {
  const current = await db.registryCrawlRun.findFirst({ where: { id: runId, organizationId } });
  if (!current) throw new Error("Registry crawl run not found or access denied.");
  assertRunTransition(current.status, to);
  const changed = await db.registryCrawlRun.updateMany({
    where: { id: runId, organizationId, status: current.status },
    data: {
      ...data,
      status: to,
      ...(to === "PLANNING" && !current.startedAt ? { startedAt: new Date() } : {}),
      ...(["COMPLETE", "PARTIAL", "FAILED", "CANCELLED"].includes(to) ? { completedAt: new Date() } : {}),
    },
  });
  if (changed.count !== 1) throw new Error("Registry crawl run changed concurrently; retry the operation.");
  return db.registryCrawlRun.findUniqueOrThrow({ where: { id: runId } });
}

export async function controlCrawlRun(
  organizationId: string,
  runId: string,
  action: "pause" | "resume" | "cancel",
) {
  const run = await db.registryCrawlRun.findFirst({ where: { id: runId, organizationId } });
  if (!run) throw new Error("Registry crawl run not found or access denied.");
  const queue = getRegistryQueue();

  if (action === "pause") {
    assertRunTransition(run.status, "PAUSED");
    const paused = await transitionCrawlRun(
      organizationId,
      runId,
      "PAUSED",
      { stopReason: "OPERATOR_PAUSED" },
    );
    if (run.queueJobId) await queue.cancel(run.queueJobId).catch(() => undefined);
    return paused;
  }
  if (action === "resume") {
    assertRunTransition(run.status, "QUEUED");
    const queueJobId = crypto.randomUUID();
    const queued = await transitionCrawlRun(organizationId, runId, "QUEUED", {
      stopReason: null,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      queueJobId,
    });
    try {
      await queue.enqueueRun({
        runId,
        targetId: run.targetId,
        organizationId,
        traceId: run.traceId,
      }, run.priority, queueJobId);
      return queued;
    } catch (error) {
      await transitionCrawlRun(organizationId, runId, "PAUSED", { stopReason: "OPERATOR_PAUSED" });
      throw error;
    }
  }

  assertRunTransition(run.status, "CANCELLED");
  const cancelled = await transitionCrawlRun(
    organizationId,
    runId,
    "CANCELLED",
    { stopReason: "OPERATOR_CANCELLED" },
  );
  if (run.queueJobId) await queue.cancel(run.queueJobId).catch(() => undefined);
  return cancelled;
}
