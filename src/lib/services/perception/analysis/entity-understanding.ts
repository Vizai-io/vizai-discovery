/**
 * @fileOverview Entity Understanding Analyzer.
 *
 * Evaluates whether AI models correctly understand the fundamental aspects
 * of a business: what it is, what it does, who it serves, and where it operates.
 *
 * This is one of the highest-value sections of the scan — it gives the business
 * owner a clear picture of how AI "sees" them across multiple dimensions.
 */

import type {
  ModelResponse,
  GroundTruth,
  EntityUnderstanding,
  EntityDimension,
  UnderstandingStatus,
} from "@/lib/types/perception-scan";
import { fuzzyContains, listOverlap } from "./string-utils";

/**
 * Analyze entity understanding across all successful model responses.
 */
export function analyzeEntityUnderstanding(
  results: ModelResponse[],
  groundTruth?: GroundTruth,
): EntityUnderstanding {
  const successful = results.filter((r) => r.success);

  const business_type = analyzeBusinessType(successful, groundTruth);
  const services = analyzeServices(successful, groundTruth);
  const geography = analyzeGeography(successful, groundTruth);
  const customer_type = analyzeCustomerType(successful, groundTruth);

  // Overall score: average of dimension scores
  const dimensionScores = [business_type, services, geography, customer_type]
    .map((d) => statusToScore(d.status));
  const overall_score = Math.round(
    dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length
  );

  return { business_type, services, geography, customer_type, overall_score };
}

// ── Dimension analyzers ──────────────────────────────────────────

function analyzeBusinessType(
  results: ModelResponse[],
  gt?: GroundTruth,
): EntityDimension {
  const inferred: Record<string, string> = {};
  for (const r of results) {
    inferred[r.model_id] = r.perception.business_type || "(not specified)";
  }

  // Determine expected from ground truth
  const expected = gt?.official_industries?.[0]
    || gt?.official_description?.split(".")[0]
    || "Not provided in ground truth";

  // Evaluate status
  let status: UnderstandingStatus = "not_mentioned";
  let notes = "";

  if (results.length === 0) {
    notes = "No successful model responses.";
  } else {
    const types = Object.values(inferred).filter((v) => v !== "(not specified)");

    if (types.length === 0) {
      status = "not_mentioned";
      notes = "No model provided a business type classification.";
    } else if (gt?.official_industries?.length || gt?.official_description) {
      // Check if the inferred types match ground truth
      const scores = types.map((t) => fuzzyContains(t, expected));
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      if (avgScore >= 0.5) {
        status = "correct";
        notes = "Models correctly identify the business type.";
      } else if (avgScore >= 0.25) {
        status = "partially_correct";
        notes = `Models partially identify the business type. Expected "${expected}" but got variations.`;
      } else {
        status = "incorrect";
        notes = `Models misclassify the business. Expected "${expected}".`;
      }
    } else {
      // No ground truth to compare — report what models say
      status = "partially_correct";
      notes = "No ground truth provided; cannot fully verify. Models provided classifications.";
    }
  }

  return { inferred_by_models: inferred, expected, status, notes };
}

function analyzeServices(
  results: ModelResponse[],
  gt?: GroundTruth,
): EntityDimension {
  const inferred: Record<string, string> = {};
  for (const r of results) {
    inferred[r.model_id] = r.perception.services_mentioned.join(", ") || "(none mentioned)";
  }

  const expected = gt?.official_services?.join(", ") || "Not provided in ground truth";

  let status: UnderstandingStatus = "not_mentioned";
  let notes = "";

  if (results.length === 0) {
    notes = "No successful model responses.";
  } else {
    const allMentioned = results.flatMap((r) => r.perception.services_mentioned);

    if (allMentioned.length === 0) {
      status = "not_mentioned";
      notes = "No model mentioned any specific services.";
    } else if (gt?.official_services?.length) {
      const overlap = listOverlap(gt.official_services, allMentioned);

      if (overlap.ratio >= 0.7) {
        status = "correct";
        notes = `Models cover ${Math.round(overlap.ratio * 100)}% of official services.`;
      } else if (overlap.ratio >= 0.3) {
        status = "partially_correct";
        notes = `Models cover ${Math.round(overlap.ratio * 100)}% of official services. Missing: ${overlap.unmatched.join(", ")}.`;
      } else {
        status = "incorrect";
        notes = `Models only cover ${Math.round(overlap.ratio * 100)}% of official services. Missing: ${overlap.unmatched.join(", ")}.`;
      }
    } else {
      status = "partially_correct";
      notes = `Models mention services but no ground truth to verify against.`;
    }
  }

  return { inferred_by_models: inferred, expected, status, notes };
}

function analyzeGeography(
  results: ModelResponse[],
  gt?: GroundTruth,
): EntityDimension {
  const inferred: Record<string, string> = {};
  for (const r of results) {
    inferred[r.model_id] = r.perception.locations_mentioned.join(", ") || "(none mentioned)";
  }

  const expected = gt?.official_locations?.join(", ") || "Not provided in ground truth";

  let status: UnderstandingStatus = "not_mentioned";
  let notes = "";

  if (results.length === 0) {
    notes = "No successful model responses.";
  } else {
    const allMentioned = results.flatMap((r) => r.perception.locations_mentioned);

    if (allMentioned.length === 0) {
      status = "not_mentioned";
      notes = "No model mentioned any geographic locations.";
    } else if (gt?.official_locations?.length) {
      const overlap = listOverlap(gt.official_locations, allMentioned);

      if (overlap.ratio >= 0.6) {
        status = "correct";
        notes = `Models identify ${Math.round(overlap.ratio * 100)}% of operating regions.`;
      } else if (overlap.ratio >= 0.25) {
        status = "partially_correct";
        notes = `Models identify ${Math.round(overlap.ratio * 100)}% of operating regions. Missing: ${overlap.unmatched.join(", ")}.`;
      } else {
        status = "incorrect";
        notes = `Models poorly identify operating geography. Missing: ${overlap.unmatched.join(", ")}.`;
      }
    } else {
      status = "partially_correct";
      notes = `Models mention locations but no ground truth to verify against.`;
    }
  }

  return { inferred_by_models: inferred, expected, status, notes };
}

function analyzeCustomerType(
  results: ModelResponse[],
  gt?: GroundTruth,
): EntityDimension {
  const inferred: Record<string, string> = {};
  for (const r of results) {
    inferred[r.model_id] = r.perception.customer_types_mentioned.join(", ") || "(none mentioned)";
  }

  // Ground truth doesn't have explicit customer types, but we can infer
  // from description and differentiators
  const expected = "Not explicitly provided in ground truth";

  let status: UnderstandingStatus = "not_mentioned";
  let notes = "";

  if (results.length === 0) {
    notes = "No successful model responses.";
  } else {
    const allMentioned = results.flatMap((r) => r.perception.customer_types_mentioned);

    if (allMentioned.length === 0) {
      status = "not_mentioned";
      notes = "No model mentioned target customer types. This is a visibility gap.";
    } else {
      // Without explicit ground truth for customers, we just report what models say
      const uniqueTypes = [...new Set(allMentioned.map((t) => t.toLowerCase()))];
      status = "partially_correct";
      notes = `Models identify ${uniqueTypes.length} customer type(s). Verify these match your actual customer base.`;
    }
  }

  return { inferred_by_models: inferred, expected, status, notes };
}

// ── Utilities ────────────────────────────────────────────────────

function statusToScore(status: UnderstandingStatus): number {
  switch (status) {
    case "correct": return 100;
    case "partially_correct": return 60;
    case "incorrect": return 20;
    case "not_mentioned": return 0;
  }
}
