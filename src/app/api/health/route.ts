/**
 * Public liveness probe. It intentionally exposes no provider, database, or
 * infrastructure diagnostics.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "vizai-discovery",
    timestamp: new Date().toISOString(),
    revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
  });
}
