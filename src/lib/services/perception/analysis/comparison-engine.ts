/**
 * @fileOverview Side-by-side comparison engine.
 *
 * Takes all model outputs from a scan and produces a structured comparison
 * showing agreements, differences, and conflicts between models.
 */

import type {
  ModelResponse,
  PerceptionComparison,
  ComparisonItem,
} from "@/lib/types/perception-scan";
import { jaccardSimilarity, normalize, listOverlap } from "./string-utils";

/**
 * Compare all model outputs and produce a structured comparison report.
 */
export function compareModelOutputs(results: ModelResponse[]): PerceptionComparison {
  const successful = results.filter((r) => r.success);

  if (successful.length === 0) {
    return emptyComparison(results);
  }

  if (successful.length === 1) {
    return singleModelComparison(successful[0], results);
  }

  const agreements: ComparisonItem[] = [];
  const differences: ComparisonItem[] = [];
  const conflicts: ComparisonItem[] = [];

  // 1. Compare business descriptions
  compareDescriptions(successful, agreements, differences, conflicts);

  // 2. Compare services mentioned
  compareLists(successful, "services_mentioned", "services", agreements, differences, conflicts);

  // 3. Compare industries
  compareLists(successful, "industries_mentioned", "industry", agreements, differences, conflicts);

  // 4. Compare locations
  compareLists(successful, "locations_mentioned", "geography", agreements, differences, conflicts);

  // 5. Compare customer types
  compareLists(successful, "customer_types_mentioned", "customer_type", agreements, differences, conflicts);

  // 6. Compare differentiators
  compareLists(successful, "differentiators_mentioned", "differentiators", agreements, differences, conflicts);

  // 7. Compare business type classification
  compareBusinessType(successful, agreements, differences, conflicts);

  // Build summary
  const totalItems = agreements.length + differences.length + conflicts.length;
  const agreementPct = totalItems > 0 ? Math.round((agreements.length / totalItems) * 100) : 0;

  const perception_summary =
    `Across ${successful.length} model(s), ${agreements.length} point(s) of agreement, ` +
    `${differences.length} difference(s), and ${conflicts.length} conflict(s) were found. ` +
    `Overall agreement: ${agreementPct}%.`;

  return {
    perception_summary,
    model_outputs: results.map((r) => ({
      model_id: r.model_id,
      summary: r.summary,
      raw_response: r.raw_response,
    })),
    comparison: { agreements, differences, conflicts },
  };
}

// ── Internal helpers ─────────────────────────────────────────────

function compareDescriptions(
  results: ModelResponse[],
  agreements: ComparisonItem[],
  differences: ComparisonItem[],
  conflicts: ComparisonItem[],
): void {
  // Compare each pair of descriptions
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      const sim = jaccardSimilarity(
        a.perception.business_description,
        b.perception.business_description,
      );

      const models = [a.model_id, b.model_id];

      if (sim > 0.6) {
        agreements.push({
          category: "business_description",
          detail: `Both models describe the business similarly (${Math.round(sim * 100)}% token overlap)`,
          models_involved: models,
        });
      } else if (sim > 0.3) {
        differences.push({
          category: "business_description",
          detail: `Models describe the business differently (${Math.round(sim * 100)}% overlap). "${a.model_id}": "${a.perception.business_description.slice(0, 100)}..." vs "${b.model_id}": "${b.perception.business_description.slice(0, 100)}..."`,
          models_involved: models,
        });
      } else {
        conflicts.push({
          category: "business_description",
          detail: `Models have very different descriptions (${Math.round(sim * 100)}% overlap). This may indicate the business is not well-known to one or both models.`,
          models_involved: models,
        });
      }
    }
  }
}

function compareLists(
  results: ModelResponse[],
  perceptionKey: keyof ModelResponse["perception"],
  category: string,
  agreements: ComparisonItem[],
  differences: ComparisonItem[],
  conflicts: ComparisonItem[],
): void {
  // Collect all items across all models
  const modelItems = results.map((r) => ({
    model_id: r.model_id,
    items: (r.perception[perceptionKey] as string[]) || [],
  }));

  // Find items mentioned by all models (agreements)
  const allItems = new Set<string>();
  modelItems.forEach((m) => m.items.forEach((item) => allItems.add(normalize(item))));

  for (const normItem of allItems) {
    const mentionedBy = modelItems
      .filter((m) => m.items.some((i) => normalize(i) === normItem || jaccardSimilarity(i, normItem) > 0.6))
      .map((m) => m.model_id);

    // Find the original (non-normalized) version of the item
    let originalItem = normItem;
    for (const m of modelItems) {
      const found = m.items.find((i) => normalize(i) === normItem);
      if (found) { originalItem = found; break; }
    }

    if (mentionedBy.length === results.length) {
      agreements.push({
        category,
        detail: `All models mention: "${originalItem}"`,
        models_involved: mentionedBy,
      });
    } else if (mentionedBy.length > 0) {
      const missingFrom = modelItems
        .filter((m) => !mentionedBy.includes(m.model_id))
        .map((m) => m.model_id);

      differences.push({
        category,
        detail: `"${originalItem}" mentioned by ${mentionedBy.join(", ")} but not by ${missingFrom.join(", ")}`,
        models_involved: [...mentionedBy, ...missingFrom],
      });
    }
  }
}

function compareBusinessType(
  results: ModelResponse[],
  agreements: ComparisonItem[],
  differences: ComparisonItem[],
  conflicts: ComparisonItem[],
): void {
  const types = results.map((r) => ({
    model_id: r.model_id,
    type: r.perception.business_type,
  }));

  // Check pairwise similarity
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const sim = jaccardSimilarity(types[i].type, types[j].type);
      const models = [types[i].model_id, types[j].model_id];

      if (sim > 0.5) {
        agreements.push({
          category: "business_type",
          detail: `Both classify the business similarly: "${types[i].type}" / "${types[j].type}"`,
          models_involved: models,
        });
      } else if (types[i].type && types[j].type) {
        conflicts.push({
          category: "business_type",
          detail: `Classification conflict: "${types[i].model_id}" says "${types[i].type}" but "${types[j].model_id}" says "${types[j].type}"`,
          models_involved: models,
        });
      }
    }
  }
}

function emptyComparison(results: ModelResponse[]): PerceptionComparison {
  return {
    perception_summary: "No successful model responses to compare.",
    model_outputs: results.map((r) => ({
      model_id: r.model_id,
      summary: r.error_message || "Failed",
      raw_response: r.raw_response,
    })),
    comparison: { agreements: [], differences: [], conflicts: [] },
  };
}

function singleModelComparison(result: ModelResponse, allResults: ModelResponse[]): PerceptionComparison {
  return {
    perception_summary: `Only one model (${result.model_id}) returned results. Cross-model comparison requires at least two successful responses.`,
    model_outputs: allResults.map((r) => ({
      model_id: r.model_id,
      summary: r.success ? r.summary : (r.error_message || "Failed"),
      raw_response: r.raw_response,
    })),
    comparison: { agreements: [], differences: [], conflicts: [] },
  };
}
