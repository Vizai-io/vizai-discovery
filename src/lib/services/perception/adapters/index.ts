/**
 * @fileOverview Adapter registry for perception scan providers.
 *
 * Auto-detects which providers have API keys configured and returns
 * only the adapters that can actually run. If a specific list of model
 * IDs is requested, filters to just those.
 */

import type { PerceptionAdapter } from "@/lib/types/perception-scan";
import { OpenAIPerceptionAdapter } from "./openai-perception-adapter";
import { GeminiPerceptionAdapter } from "./gemini-perception-adapter";

/** All known adapters. Add new providers here. */
function allAdapters(): PerceptionAdapter[] {
  return [
    new OpenAIPerceptionAdapter(),
    new GeminiPerceptionAdapter(),
  ];
}

/**
 * Returns adapters that have their API keys configured.
 * If `requestedModels` is provided, further filters to just those model IDs.
 */
export function getEnabledPerceptionAdapters(requestedModels?: string[]): PerceptionAdapter[] {
  const available: PerceptionAdapter[] = [];

  // OpenAI — needs OPENAI_API_KEY
  if (process.env.OPENAI_API_KEY) {
    available.push(new OpenAIPerceptionAdapter());
  }

  // Gemini — needs GOOGLE_GENAI_API_KEY
  if (process.env.GOOGLE_GENAI_API_KEY) {
    available.push(new GeminiPerceptionAdapter());
  }

  // If specific models requested, filter to just those
  if (requestedModels && requestedModels.length > 0) {
    return available.filter((a) => requestedModels.includes(a.model_id));
  }

  return available;
}

/**
 * Returns a human-readable list of all registered adapters and whether they're configured.
 * Useful for the health endpoint.
 */
export function getAdapterStatus(): { model_id: string; provider: string; configured: boolean }[] {
  const checks: Record<string, boolean> = {
    "openai:gpt-4o": !!process.env.OPENAI_API_KEY,
    "google:gemini-2.5-flash": !!process.env.GOOGLE_GENAI_API_KEY,
  };

  return allAdapters().map((a) => ({
    model_id: a.model_id,
    provider: a.provider,
    configured: checks[a.model_id] ?? false,
  }));
}
