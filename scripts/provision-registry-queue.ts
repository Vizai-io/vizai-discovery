import { provisionRegistryQueue } from "@/lib/registry-intelligence/queue";

provisionRegistryQueue()
  .then(() => {
    console.log("[registry-queue] schema and queues provisioned");
  })
  .catch((error) => {
    console.error("[registry-queue] provisioning failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    process.exitCode = 1;
  });
