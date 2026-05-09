/**
 * @fileOverview GET /api/health — Health check endpoint.
 *
 * Returns system status including:
 * - API availability
 * - Configured AI providers and their status
 * - Postgres (Supabase) connectivity
 * - Timestamp
 */

import { NextResponse } from "next/server";
import { getAdapterStatus } from "@/lib/services/perception/adapters";
import { db } from "@/lib/db";

export async function GET() {
  const health: Record<string, any> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    service: "VizAI Perception Scan Engine",
  };

  // Check AI provider configuration
  health.providers = getAdapterStatus();
  const configuredCount = health.providers.filter((p: any) => p.configured).length;
  health.providers_summary = `${configuredCount}/${health.providers.length} providers configured`;

  // Check Postgres connectivity
  try {
    await db.$queryRaw`SELECT 1`;
    health.database = "connected";
    health.database_type = "postgresql";
  } catch (err: any) {
    health.database = "error";
    health.database_error = err.message;
    health.status = "degraded";
  }

  // Warn if no providers configured
  if (configuredCount === 0) {
    health.status = "degraded";
    health.warning =
      "No AI providers configured. Set OPENAI_API_KEY and/or GOOGLE_GENAI_API_KEY.";
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
