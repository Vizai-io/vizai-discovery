/**
 * @fileOverview GET|POST /api/cron/model-health
 *
 * Proactive AI-model health probe. Checks each perception model's API key
 * with a lightweight provider call (no full scan), and alerts the admin
 * org when a model is down — so a dead key is caught before a customer
 * runs a scan, not after.
 *
 * Checks:
 *   - OpenAI (gpt-4o): GET /v1/models with OPENAI_API_KEY. On 401/403,
 *     also probes OPENAI_API_KEY_FALLBACK (if set) to report whether the
 *     fallback would save scans.
 *   - Google (gemini-2.5-flash): GET /v1beta/models with GOOGLE_GENAI_API_KEY.
 *     Same fallback probe for GOOGLE_GENAI_API_KEY_FALLBACK.
 *
 * On failure, emits NotificationService.modelHealthAlert (deduped to
 * 1/day per model) and an operational event. Returns a JSON summary.
 *
 * Security: requires `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Schedule recommendation (vercel.json):
 *   { "path": "/api/cron/model-health", "schedule": "0 * * * *" }
 *   -> Runs hourly. On a local dev server, call it from a Windows
 *   Scheduled Task with the same CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron/runtime";
import { NotificationService } from "@/lib/services/notification.service";
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from "@/lib/services/operational-event-service";

type ModelCheck = {
  model_id: string;
  provider: string;
  ok: boolean;
  status?: number;
  error?: string;
  fallbackOk?: boolean;
};

async function checkOpenAI(): Promise<ModelCheck> {
  const key = process.env.OPENAI_API_KEY;
  const fallbackKey = process.env.OPENAI_API_KEY_FALLBACK;
  const result: ModelCheck = { model_id: "openai:gpt-4o", provider: "OpenAI", ok: false };
  if (!key) {
    result.error = "OPENAI_API_KEY not configured";
    return result;
  }
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      result.ok = true;
      result.status = res.status;
      return result;
    }
    result.status = res.status;
    result.error = `OpenAI API ${res.status}`;
    // Probe the fallback key so the report says whether scans would survive.
    if ((res.status === 401 || res.status === 403) && fallbackKey && fallbackKey !== key) {
      try {
        const fb = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${fallbackKey}` },
        });
        result.fallbackOk = fb.ok;
        if (!fb.ok) result.error += `; fallback also ${fb.status}`;
      } catch {
        result.fallbackOk = false;
      }
    }
    return result;
  } catch (err: any) {
    result.error = err?.message || "OpenAI probe failed";
    return result;
  }
}

async function checkGemini(): Promise<ModelCheck> {
  const key = process.env.GOOGLE_GENAI_API_KEY;
  const fallbackKey = process.env.GOOGLE_GENAI_API_KEY_FALLBACK;
  const result: ModelCheck = { model_id: "google:gemini-2.5-flash", provider: "Google", ok: false };
  if (!key) {
    result.error = "GOOGLE_GENAI_API_KEY not configured";
    return result;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
    );
    if (res.ok) {
      result.ok = true;
      result.status = res.status;
      return result;
    }
    result.status = res.status;
    result.error = `Gemini API ${res.status}`;
    if ((res.status === 401 || res.status === 403) && fallbackKey && fallbackKey !== key) {
      try {
        const fb = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${fallbackKey}`,
        );
        result.fallbackOk = fb.ok;
        if (!fb.ok) result.error += `; fallback also ${fb.status}`;
      } catch {
        result.fallbackOk = false;
      }
    }
    return result;
  } catch (err: any) {
    result.error = err?.message || "Gemini probe failed";
    return result;
  }
}

async function handleModelHealth(request: NextRequest) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const adminOrgId = process.env.ADMIN_ORG_ID || "admin-org";
  const checks = await Promise.all([checkOpenAI(), checkGemini()]);
  const failures = checks.filter((c) => !c.ok);

  for (const f of failures) {
    void NotificationService.modelHealthAlert(adminOrgId, f.model_id, f.error || "Unknown error");
    void OperationalEventService.emit({
      eventType: EVENT_TYPES.SCAN_FAILED,
      severity: SEVERITIES.CRITICAL,
      source: EVENT_SOURCES.SYSTEM_INTERNAL,
      traceId: crypto.randomUUID(),
      organizationId: adminOrgId,
      entityType: "model",
      entityId: f.model_id,
      message: `Model health check failed for ${f.model_id}: ${f.error || "unknown error"}`,
      metadata: { modelId: f.model_id, status: f.status, fallbackOk: f.fallbackOk },
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    models: checks,
  });
}

export async function GET(request: NextRequest) {
  return handleModelHealth(request);
}

export async function POST(request: NextRequest) {
  return handleModelHealth(request);
}
