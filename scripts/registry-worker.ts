import "dotenv/config";
import { getRegistryQueue } from "../src/lib/registry-intelligence/queue";
import { processFoundationRun } from "../src/lib/registry-intelligence/foundation-worker";
import {
  createWorkerProbeServer,
  type WorkerMetrics,
} from "../src/lib/registry-intelligence/worker-observability";
import { logger } from "../src/lib/observability/logger";

async function main(): Promise<void> {
  const queue = getRegistryQueue();
  const metrics: WorkerMetrics = { started: 0, completed: 0, failed: 0, active: 0 };
  const probes = createWorkerProbeServer(metrics);

  await queue.work(async (job) => {
    metrics.started += 1;
    metrics.active += 1;
    const startedAt = Date.now();
    try {
      const result = await processFoundationRun(job);
      metrics.completed += 1;
      metrics.lastCompletedAt = new Date().toISOString();
      logger.info("registry job completed", {
        jobId: job.id,
        runId: job.data.runId,
        durationMs: Date.now() - startedAt,
        result,
      });
      return result;
    } catch (error) {
      metrics.failed += 1;
      logger.error("registry job failed", {
        jobId: job.id,
        runId: job.data.runId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    } finally {
      metrics.active -= 1;
    }
  });
  await probes.start();
  logger.info("registry worker ready", {
    concurrency: Number(process.env.REGISTRY_WORKER_CONCURRENCY ?? "2"),
    healthPort: Number(process.env.REGISTRY_WORKER_HEALTH_PORT ?? "8081"),
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("registry worker stopping", { signal });
    await probes.stop();
    await queue.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error("registry worker startup failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
