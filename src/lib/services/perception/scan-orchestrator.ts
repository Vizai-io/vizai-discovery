/**
 * @fileOverview Perception Scan Orchestrator.
 *
 * This is the main entry point for running a perception scan.
 * It coordinates:
 * 1. Prompt generation
 * 2. Multi-model querying (parallel, with per-model error isolation)
 * 3. Comparison analysis
 * 4. Inaccuracy detection
 * 5. Gap/omission detection
 * 6. Entity understanding analysis
 * 7. Consistency scoring
 * 8. Recommendation generation
 * 9. Report generation (JSON + Markdown)
 *
 * If one model fails, the scan continues with the others.
 * If ALL models fail, a useful error response is returned.
 */

import type {
  PerceptionScanInput,
  PerceptionScanResult,
  ModelResponse,
  GroundTruth,
} from "@/lib/types/perception-scan";
import { getEnabledPerceptionAdapters } from "./adapters";
import { generateDefaultPrompt } from "./prompt-generator";
import {
  compareModelOutputs,
  detectInaccuracies,
  detectOmissions,
  analyzeEntityUnderstanding,
  scoreConsistency,
  generateRecommendations,
} from "./analysis";
import { generateJSONReport, generateMarkdownReport } from "./report-generator";

export interface ScanProgress {
  step: string;
  detail?: string;
}

/**
 * Run a full perception scan.
 *
 * @param input - Scan input parameters
 * @param scanId - Pre-assigned scan ID (from Firestore or generated)
 * @param onProgress - Optional callback for real-time progress updates
 */
export async function runPerceptionScan(
  input: PerceptionScanInput,
  scanId: string,
  onProgress?: (progress: ScanProgress) => Promise<void>,
): Promise<PerceptionScanResult> {
  const startTime = new Date().toISOString();

  // ── Step 1: Resolve prompt ────────────────────────────────────
  await onProgress?.({ step: "Generating scan prompt..." });

  const prompt = input.prompt || generateDefaultPrompt(
    input.business_name,
    input.website_url,
    input.ground_truth,
  );

  // ── Step 2: Get available adapters ────────────────────────────
  const adapters = getEnabledPerceptionAdapters(input.models);

  if (adapters.length === 0) {
    return buildFailedResult(
      scanId,
      input,
      prompt,
      startTime,
      "No AI providers configured. Set OPENAI_API_KEY and/or GOOGLE_GENAI_API_KEY in your environment.",
    );
  }

  const modelsRequested = adapters.map((a) => a.model_id);

  // ── Step 3: Query all models in parallel ──────────────────────
  await onProgress?.({ step: "Querying AI models...", detail: modelsRequested.join(", ") });

  const modelResults: ModelResponse[] = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        await onProgress?.({ step: `Querying ${adapter.display_name}...` });
        return await adapter.queryPerception(prompt, input.business_name);
      } catch (err: any) {
        // Per-model error isolation: if one model throws, others continue
        console.error(`Adapter ${adapter.model_id} threw:`, err.message);
        return {
          model_id: adapter.model_id,
          provider: adapter.provider,
          raw_response: "",
          summary: "",
          perception: {
            business_description: "",
            services_mentioned: [],
            industries_mentioned: [],
            locations_mentioned: [],
            customer_types_mentioned: [],
            differentiators_mentioned: [],
            business_type: "",
            additional_claims: [],
          },
          timestamp: new Date().toISOString(),
          success: false,
          error_message: err.message || "Unknown adapter error",
          latency_ms: 0,
        };
      }
    }),
  );

  // Check if ALL models failed
  const successfulResults = modelResults.filter((r) => r.success);
  if (successfulResults.length === 0) {
    const errors = modelResults.map((r) => `${r.model_id}: ${r.error_message}`).join("; ");
    return buildFailedResult(scanId, input, prompt, startTime, `All models failed. ${errors}`);
  }

  // ── Step 4: Run analysis pipeline ─────────────────────────────
  await onProgress?.({ step: "Comparing model outputs..." });
  const comparison = compareModelOutputs(modelResults);

  await onProgress?.({ step: "Detecting inaccuracies..." });
  const inaccuracy_report = input.ground_truth
    ? detectInaccuracies(modelResults, input.ground_truth)
    : { inaccuracies: [], partial_matches: [], unverifiable_claims: [], accuracy_score: 100 };

  await onProgress?.({ step: "Detecting omissions..." });
  const omission_report = input.ground_truth
    ? detectOmissions(modelResults, input.ground_truth)
    : { omissions: [], coverage_score: 100 };

  await onProgress?.({ step: "Analyzing entity understanding..." });
  const entity_understanding = analyzeEntityUnderstanding(modelResults, input.ground_truth);

  await onProgress?.({ step: "Scoring consistency..." });
  const consistency = scoreConsistency(modelResults);

  // ── Step 5: Generate recommendations ──────────────────────────
  await onProgress?.({ step: "Generating recommendations..." });
  const recommendations = generateRecommendations({
    inaccuracy_report,
    omission_report,
    entity_understanding,
    consistency,
    comparison,
    businessName: input.business_name,
  });

  // ── Step 6: Build final result ────────────────────────────────
  await onProgress?.({ step: "Generating reports..." });

  const result: PerceptionScanResult = {
    scan_id: scanId,
    status: "complete",
    business_name: input.business_name,
    website_url: input.website_url,
    prompt_used: prompt,
    models_requested: modelsRequested,
    created_at: startTime,
    completed_at: new Date().toISOString(),
    model_results: modelResults,
    comparison,
    inaccuracy_report,
    omission_report,
    entity_understanding,
    consistency,
    recommendations,
    markdown_report: "", // Generated below
    json_report: {},     // Generated below
    ground_truth: input.ground_truth,
  };

  // Generate reports
  result.json_report = generateJSONReport(result);
  result.markdown_report = generateMarkdownReport(result);

  await onProgress?.({ step: "Complete" });
  return result;
}

// ── Helpers ──────────────────────────────────────────────────────

function buildFailedResult(
  scanId: string,
  input: PerceptionScanInput,
  prompt: string,
  startTime: string,
  error: string,
): PerceptionScanResult {
  return {
    scan_id: scanId,
    status: "failed",
    business_name: input.business_name,
    website_url: input.website_url,
    prompt_used: prompt,
    models_requested: input.models || [],
    created_at: startTime,
    model_results: [],
    comparison: {
      perception_summary: "Scan failed.",
      model_outputs: [],
      comparison: { agreements: [], differences: [], conflicts: [] },
    },
    inaccuracy_report: { inaccuracies: [], partial_matches: [], unverifiable_claims: [], accuracy_score: 0 },
    omission_report: { omissions: [], coverage_score: 0 },
    entity_understanding: {
      business_type: { inferred_by_models: {}, expected: "", status: "not_mentioned", notes: "Scan failed." },
      services: { inferred_by_models: {}, expected: "", status: "not_mentioned", notes: "Scan failed." },
      geography: { inferred_by_models: {}, expected: "", status: "not_mentioned", notes: "Scan failed." },
      customer_type: { inferred_by_models: {}, expected: "", status: "not_mentioned", notes: "Scan failed." },
      overall_score: 0,
    },
    consistency: { consistency_score: 0, consistency_label: "high agreement", consistency_notes: ["Scan failed."] },
    recommendations: [],
    markdown_report: `# Scan Failed\n\n**Error:** ${error}`,
    json_report: { error },
    ground_truth: input.ground_truth,
    error,
  };
}
