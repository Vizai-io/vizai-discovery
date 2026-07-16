import { PgBoss, type JobWithMetadata } from "pg-boss";
import {
  REGISTRY_DEAD_LETTER_QUEUE,
  REGISTRY_QUEUE_NAME,
  type RegistryRunJob,
} from "./contracts";

export class RegistryQueue {
  private readonly boss: PgBoss;
  private startPromise?: Promise<PgBoss>;

  constructor(connectionString: string) {
    this.boss = new PgBoss({
      connectionString,
      application_name: "vizai-registry-intelligence",
      useListenNotify: false,
      migrate: process.env.REGISTRY_QUEUE_MIGRATE === "true",
      createSchema: process.env.REGISTRY_QUEUE_MIGRATE === "true",
    });
    this.boss.on("error", (error) => {
      console.error("[registry-queue] pg-boss error", { error: error.message });
    });
    this.boss.on("warning", (warning) => {
      console.warn("[registry-queue] pg-boss warning", warning);
    });
  }

  async start(): Promise<PgBoss> {
    if (!this.startPromise) {
      this.startPromise = this.boss.start().then(async (boss) => {
        await boss.createQueue(REGISTRY_DEAD_LETTER_QUEUE, {
          retryLimit: 0,
          deleteAfterSeconds: 30 * 24 * 60 * 60,
        });
        await boss.createQueue(REGISTRY_QUEUE_NAME, {
          retryLimit: 4,
          retryDelay: 30,
          retryBackoff: true,
          expireInSeconds: 120,
          deleteAfterSeconds: 14 * 24 * 60 * 60,
          deadLetter: REGISTRY_DEAD_LETTER_QUEUE,
        });
        return boss;
      });
    }
    return this.startPromise;
  }

  async enqueueRun(job: RegistryRunJob, priority = 0, jobId?: string): Promise<string> {
    const boss = await this.start();
    const requestedId = jobId;
    if (requestedId && await boss.getJobById(REGISTRY_QUEUE_NAME, requestedId)) {
      return requestedId;
    }
    try {
      const id = await boss.send(REGISTRY_QUEUE_NAME, job, {
        id: requestedId,
        priority,
        singletonKey: job.runId,
        retryLimit: 4,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 120,
        deadLetter: REGISTRY_DEAD_LETTER_QUEUE,
      });
      if (id) return id;
    } catch (error) {
      if (requestedId && await boss.getJobById(REGISTRY_QUEUE_NAME, requestedId)) {
        return requestedId;
      }
      throw error;
    }
    if (requestedId && await boss.getJobById(REGISTRY_QUEUE_NAME, requestedId)) {
      return requestedId;
    }
    throw new Error(`A Registry queue job already exists for run ${job.runId}.`);
  }

  async work(handler: (job: JobWithMetadata<RegistryRunJob>) => Promise<object | void>): Promise<string> {
    const boss = await this.start();
    return boss.work(REGISTRY_QUEUE_NAME, {
      localConcurrency: Number(process.env.REGISTRY_WORKER_CONCURRENCY ?? "2"),
      pollingIntervalSeconds: 2,
      includeMetadata: true as const,
    }, async (jobs: JobWithMetadata<RegistryRunJob>[]) => {
      for (const job of jobs) await handler(job);
    });
  }

  async cancel(jobId: string): Promise<void> {
    const boss = await this.start();
    await boss.cancel(REGISTRY_QUEUE_NAME, jobId);
  }

  async stop(): Promise<void> {
    if (!this.startPromise) return;
    const boss = await this.startPromise;
    await boss.stop({ graceful: true, timeout: 30_000 });
    this.startPromise = undefined;
  }
}

const globalQueue = globalThis as unknown as { registryQueue?: RegistryQueue };

export function getRegistryQueue(): RegistryQueue {
  if (globalQueue.registryQueue) return globalQueue.registryQueue;
  const connectionString =
    process.env.REGISTRY_QUEUE_DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL;
  if (!connectionString) throw new Error("REGISTRY_QUEUE_DATABASE_URL, DIRECT_URL, or DATABASE_URL is required.");
  globalQueue.registryQueue = new RegistryQueue(connectionString);
  return globalQueue.registryQueue;
}

export async function provisionRegistryQueue(): Promise<void> {
  if (process.env.REGISTRY_QUEUE_MIGRATE !== "true") {
    throw new Error("REGISTRY_QUEUE_MIGRATE=true is required for queue provisioning.");
  }
  const queue = getRegistryQueue();
  await queue.start();
  await queue.stop();
}
