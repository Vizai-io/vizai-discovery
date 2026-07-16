import "dotenv/config";
import { getRegistryQueue } from "../src/lib/registry-intelligence/queue";
import { processFoundationRun } from "../src/lib/registry-intelligence/foundation-worker";

async function main(): Promise<void> {
  const queue = getRegistryQueue();
  await queue.work(processFoundationRun);
  console.log("[registry-worker] ready — WP-VIZ-CRAWL-01 foundation jobs only");

  const shutdown = async (signal: string) => {
    console.log(`[registry-worker] ${signal} received; stopping gracefully`);
    await queue.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[registry-worker] startup failed", error);
  process.exit(1);
});
