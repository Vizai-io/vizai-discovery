import http from "node:http";

export interface WorkerMetrics {
  started: number;
  completed: number;
  failed: number;
  active: number;
  lastCompletedAt?: string;
}

export function createWorkerProbeServer(metrics: WorkerMetrics) {
  let ready = false;
  const port = Number(process.env.REGISTRY_WORKER_HEALTH_PORT ?? "8081");
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "live" }));
      return;
    }
    if (request.url === "/readyz") {
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: ready ? "ready" : "starting" }));
      return;
    }
    if (request.url === "/metrics") {
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      response.end([
        `vizai_registry_jobs_started_total ${metrics.started}`,
        `vizai_registry_jobs_completed_total ${metrics.completed}`,
        `vizai_registry_jobs_failed_total ${metrics.failed}`,
        `vizai_registry_jobs_active ${metrics.active}`,
        "",
      ].join("\n"));
      return;
    }
    response.writeHead(404).end();
  });

  return {
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "0.0.0.0", () => {
          server.off("error", reject);
          ready = true;
          resolve();
        });
      });
    },
    async stop() {
      ready = false;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
