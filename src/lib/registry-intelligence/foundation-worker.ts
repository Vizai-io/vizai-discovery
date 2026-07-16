import { Prisma, type RobotsDecision } from "@prisma/client";
import type { JobWithMetadata } from "pg-boss";
import { db } from "@/lib/db";
import {
  EVENT_SOURCES,
  EVENT_TYPES,
  OperationalEventService,
  SEVERITIES,
} from "@/lib/services/operational-event-service";
import { acquireFoundationPage, type AcquisitionResult } from "./acquisition";
import { CrawlBudgetSchema, type RegistryRunJob } from "./contracts";
import { sha256 } from "./canonical-json";
import { createSnapshotStore, snapshotObjectKey } from "./snapshot-store";
import { normalizeUrl } from "./url-policy";
import { transitionCrawlRun } from "./registry-intelligence.service";
import { isTerminalRunStatus } from "./run-state-machine";

function asRobotsDecision(value: string): RobotsDecision {
  return value as RobotsDecision;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("html")) return "html";
  if (mimeType.includes("json")) return "json";
  if (mimeType.includes("xml")) return "xml";
  return "txt";
}

async function runControlStatus(
  runId: string,
  organizationId: string,
): Promise<"PAUSED" | "CANCELLED" | null> {
  const run = await db.registryCrawlRun.findFirst({
    where: { id: runId, organizationId },
    select: { status: true },
  });
  return run?.status === "PAUSED" || run?.status === "CANCELLED"
    ? run.status
    : null;
}

export async function processFoundationRun(job: JobWithMetadata<RegistryRunJob>): Promise<object> {
  const { runId, organizationId, targetId, traceId } = job.data;
  let taskId: string | undefined;

  try {
    let run = await db.registryCrawlRun.findFirst({
      where: { id: runId, organizationId, targetId },
      include: { target: true, autonomyPolicy: true },
    });
    if (!run || isTerminalRunStatus(run.status) || run.status === "PAUSED") {
      return { skipped: true, reason: run ? `run_${run.status.toLowerCase()}` : "run_missing" };
    }

    if (run.status === "QUEUED") {
      await transitionCrawlRun(organizationId, runId, "PLANNING");
      run = await db.registryCrawlRun.findUniqueOrThrow({
        where: { id: runId },
        include: { target: true, autonomyPolicy: true },
      });
    }
    if (run.status === "PLANNING") {
      await transitionCrawlRun(organizationId, runId, "CRAWLING");
      run = await db.registryCrawlRun.findUniqueOrThrow({
        where: { id: runId },
        include: { target: true, autonomyPolicy: true },
      });
    }
    if (run.status !== "CRAWLING") return { skipped: true, reason: `run_${run.status.toLowerCase()}` };

    const normalizedUrl = normalizeUrl(run.target.canonicalUrl);
    const urlHash = sha256(normalizedUrl);
    const idempotencyKey = `${run.id}:${urlHash}:FOUNDATION_FETCH`;
    const task = await db.registryCrawlTask.upsert({
      where: { idempotencyKey },
      create: {
        organizationId,
        runId,
        normalizedUrl,
        urlHash,
        idempotencyKey,
        status: "RUNNING",
        attemptCount: 1,
        startedAt: new Date(),
      },
      update: {
        status: "RUNNING",
        attemptCount: { increment: 1 },
        startedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    taskId = task.id;

    const budget = CrawlBudgetSchema.parse(run.budgetAllocated);
    const controller = new AbortController();
    let controlCheckRunning = false;
    const controlMonitor = setInterval(() => {
      if (controlCheckRunning) return;
      controlCheckRunning = true;
      void runControlStatus(runId, organizationId)
        .then((status) => {
          if (status) controller.abort(new Error(`Registry run ${status.toLowerCase()} by operator.`));
        })
        .finally(() => {
          controlCheckRunning = false;
        });
    }, 500);
    let acquired: AcquisitionResult;
    try {
      acquired = await acquireFoundationPage(run.target.canonicalUrl, {
        canonicalDomain: run.target.canonicalDomain,
        budget,
        signal: controller.signal,
      });
    } finally {
      clearInterval(controlMonitor);
    }

    const interruptedAfterFetch = await runControlStatus(runId, organizationId);
    if (interruptedAfterFetch) {
      await db.registryCrawlTask.update({
        where: { id: task.id },
        data: {
          status: "CANCELLED",
          lastErrorCode: `OPERATOR_${interruptedAfterFetch}`,
          lastErrorMessage: `Run ${interruptedAfterFetch.toLowerCase()} before snapshot storage.`,
          completedAt: new Date(),
        },
      });
      return { interrupted: true, status: interruptedAfterFetch };
    }
    const robotsDecision = asRobotsDecision(acquired.robots.decision);

    await db.$transaction([
      db.registryCrawlTask.update({
        where: { id: task.id },
        data: {
          robotsDecision,
          eligibilityReason: acquired.robots.reason,
        },
      }),
      db.registryAgentDecision.create({
        data: {
          organizationId,
          targetId,
          runId,
          crawlTaskId: task.id,
          step: "POLICY",
          decisionType: "ROBOTS_EVALUATION",
          inputHash: sha256(`${run.target.canonicalUrl}:${acquired.robotsFetch?.contentHash ?? "no-robots"}`),
          result: acquired.robots as unknown as Prisma.InputJsonValue,
          rationale: acquired.robots.reason,
          ruleIds: ["RFC9309", "WP-VIZ-CRAWL-01-ROBOTS-FAIL-CLOSED"],
          policyHash: run.policyHash,
          traceId,
        },
      }),
    ]);

    if (!acquired.robots.permitted) {
      await db.registryCrawlTask.update({
        where: { id: task.id },
        data: { status: "BLOCKED", completedAt: new Date() },
      });
      await transitionCrawlRun(organizationId, runId, "PARTIAL", {
        stopReason: "ROBOTS_BLOCKED",
        summary: acquired.robots.reason,
      });
      void OperationalEventService.emit({
        eventType: EVENT_TYPES.REGISTRY_CRAWL_PAGE_BLOCKED,
        severity: SEVERITIES.WARNING,
        source: EVENT_SOURCES.REGISTRY_INTELLIGENCE_WORKER,
        traceId,
        organizationId,
        entityType: "registry_crawl_run",
        entityId: runId,
        message: `Registry crawl blocked by robots policy for ${run.target.canonicalDomain}`,
        metadata: { targetId, taskId: task.id, robotsDecision, reason: acquired.robots.reason },
      });
      return { blocked: true, robots: acquired.robots };
    }

    if (!acquired.page || acquired.page.status < 200 || acquired.page.status >= 300) {
      throw new Error(`Foundation page returned status ${acquired.page?.status ?? "missing"}.`);
    }

    const page = acquired.page;
    const objectKey = snapshotObjectKey({
      organizationId,
      targetId,
      urlHash,
      contentHash: page.contentHash,
      extension: extensionFor(page.mimeType),
    });
    const stored = await createSnapshotStore().putIfAbsent({
      key: objectKey,
      body: page.body,
      contentType: page.mimeType,
      metadata: { runId, traceId, sourceUrl: page.finalUrl },
    });

    const snapshot = await db.registryPageSnapshot.upsert({
      where: {
        targetId_urlHash_contentHash: { targetId, urlHash, contentHash: page.contentHash },
      },
      create: {
        organizationId,
        targetId,
        runId,
        crawlTaskId: task.id,
        normalizedUrl: page.normalizedUrl,
        urlHash,
        finalUrl: page.finalUrl,
        retrievedAt: page.retrievedAt,
        httpStatus: page.status,
        mimeType: page.mimeType,
        sizeBytes: page.sizeBytes,
        contentHash: page.contentHash,
        objectKey: stored.key,
        redirectChain: page.redirectChain as Prisma.InputJsonValue,
        robotsDecision,
        fetchMetadata: {
          responseHeaders: page.responseHeaders,
          resolvedAddresses: page.resolvedAddresses,
          objectCreated: stored.created,
          robotsStatus: acquired.robotsFetch?.status ?? null,
          robotsContentHash: acquired.robotsFetch?.contentHash ?? null,
        } as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });

    await db.registryCrawlTask.update({
      where: { id: task.id },
      data: {
        status: "COMPLETE",
        actualTransport: "STATIC_HTTP",
        completedAt: new Date(),
      },
    });
    await transitionCrawlRun(organizationId, runId, "ASSESSING", {
      budgetConsumed: {
        pages: 1,
        browserPages: 0,
        bytes: page.sizeBytes,
        modelTokens: 0,
        costMicros: 0,
      },
    });
    const completed = await transitionCrawlRun(organizationId, runId, "COMPLETE", {
      stopReason: "FOUNDATION_FETCH_COMPLETE",
      summary: stored.created
        ? "Foundation page fetched and stored as a new content-addressed snapshot."
        : "Foundation page was unchanged; the existing content-addressed snapshot was reused.",
      coverageAfter: { foundationPage: true, snapshotId: snapshot.id },
    });

    const nextCrawlAt = new Date(Date.now() + run.target.freshnessHours * 60 * 60 * 1000);
    await db.registryTarget.update({
      where: { id: targetId },
      data: { lastCrawledAt: new Date(), nextCrawlAt },
    });

    void OperationalEventService.emit({
      eventType: EVENT_TYPES.REGISTRY_CRAWL_PAGE_FETCHED,
      severity: SEVERITIES.INFO,
      source: EVENT_SOURCES.REGISTRY_INTELLIGENCE_WORKER,
      traceId,
      organizationId,
      entityType: "registry_page_snapshot",
      entityId: snapshot.id,
      message: `Registry foundation page fetched for ${run.target.canonicalDomain}`,
      metadata: { targetId, runId, taskId: task.id, contentHash: page.contentHash, objectCreated: stored.created },
    });
    void OperationalEventService.emit({
      eventType: EVENT_TYPES.REGISTRY_RUN_COMPLETED,
      severity: SEVERITIES.INFO,
      source: EVENT_SOURCES.REGISTRY_INTELLIGENCE_WORKER,
      traceId,
      organizationId,
      entityType: "registry_crawl_run",
      entityId: runId,
      message: `Registry foundation run completed for ${run.target.canonicalDomain}`,
      metadata: { targetId, snapshotId: snapshot.id, stopReason: completed.stopReason },
    });
    return { completed: true, snapshotId: snapshot.id, unchanged: !stored.created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown foundation worker error";
    const interrupted = await runControlStatus(runId, organizationId).catch(() => null);
    if (interrupted) {
      if (taskId) {
        await db.registryCrawlTask.update({
          where: { id: taskId },
          data: {
            status: "CANCELLED",
            lastErrorCode: `OPERATOR_${interrupted}`,
            lastErrorMessage: `Run ${interrupted.toLowerCase()} by operator.`,
            completedAt: new Date(),
          },
        }).catch(() => undefined);
      }
      return { interrupted: true, status: interrupted };
    }

    const terminalAttempt = job.retryCount >= job.retryLimit;
    if (taskId) {
      await db.registryCrawlTask.update({
        where: { id: taskId },
        data: {
          status: terminalAttempt ? "FAILED" : "RETRY",
          lastErrorCode: "FOUNDATION_FETCH_FAILED",
          lastErrorMessage: message,
          ...(terminalAttempt ? { completedAt: new Date() } : {}),
        },
      }).catch(() => undefined);
    }

    const current = await db.registryCrawlRun.findFirst({ where: { id: runId, organizationId } });
    if (current && terminalAttempt && !isTerminalRunStatus(current.status) && current.status !== "PAUSED") {
      await transitionCrawlRun(organizationId, runId, "FAILED", {
        stopReason: "FETCH_FAILED",
        errorCode: "FOUNDATION_FETCH_FAILED",
        errorMessage: message,
      }).catch(() => undefined);
    } else if (current && !isTerminalRunStatus(current.status)) {
      await db.registryCrawlRun.update({
        where: { id: runId },
        data: { errorCode: "FOUNDATION_FETCH_RETRY", errorMessage: message },
      }).catch(() => undefined);
    }
    throw error;
  }
}
