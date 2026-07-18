/**
 * Protected platform readiness diagnostics.
 *
 * Unlike the public liveness endpoint, this route performs a database check
 * and reports deployment configuration. It never returns raw infrastructure
 * error messages or embedded architecture/backlog documentation.
 */

import { NextResponse } from "next/server";
import { requireHumanAdmin } from "@/lib/auth/get-auth-context";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireHumanAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let database: "ready" | "unavailable" = "ready";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }

  const snapshotBackend = process.env.REGISTRY_SNAPSHOT_BACKEND ??
    (process.env.NODE_ENV === "production" ? "supabase" : "local");
  const queueConfigured = Boolean(process.env.REGISTRY_QUEUE_DATABASE_URL);
  const snapshotConfigured = snapshotBackend === "local" || Boolean(
    process.env.REGISTRY_SNAPSHOT_BUCKET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
  );
  const status = database === "ready" && queueConfigured && snapshotConfigured
    ? "ready"
    : "degraded";

  return NextResponse.json({
    status,
    service: "vizai-discovery",
    revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
    timestamp: new Date().toISOString(),
    checks: {
      database,
      registryQueue: queueConfigured ? "configured" : "missing_configuration",
      snapshotStore: snapshotConfigured ? "configured" : "missing_configuration",
      snapshotBackend,
    },
  }, { status: status === "ready" ? 200 : 503 });
}
