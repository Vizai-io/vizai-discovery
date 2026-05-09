/**
 * @fileOverview Inaccuracy Detection Engine.
 *
 * Compares model perception outputs against supplied ground truth data
 * to identify statements that are inaccurate, partially accurate, or unverifiable.
 *
 * Uses practical rules-based detection with string matching + normalization.
 * This is NOT a semantic engine — it uses token overlap and containment heuristics.
 */

import type {
  ModelResponse,
  GroundTruth,
  InaccuracyReport,
  InaccuracyFinding,
  AccuracyClassification,
} from "@/lib/types/perception-scan";
import { fuzzyContains, bestMatch, normalize } from "./string-utils";

/**
 * Analyze model outputs against ground truth and classify findings.
 */
export function detectInaccuracies(
  results: ModelResponse[],
  groundTruth: GroundTruth,
): InaccuracyReport {
  const successful = results.filter((r) => r.success);

  if (successful.length === 0) {
    return { inaccuracies: [], partial_matches: [], unverifiable_claims: [], accuracy_score: 0 };
  }

  const inaccuracies: InaccuracyFinding[] = [];
  const partial_matches: InaccuracyFinding[] = [];
  const unverifiable_claims: InaccuracyFinding[] = [];

  for (const result of successful) {
    const p = result.perception;

    // 1. Check business name accuracy
    if (groundTruth.official_business_name) {
      checkStringAccuracy(
        "business_name",
        p.business_description,
        groundTruth.official_business_name,
        result.model_id,
        inaccuracies,
        partial_matches,
      );
    }

    // 2. Check business description against official description
    if (groundTruth.official_description) {
      const sim = fuzzyContains(p.business_description, groundTruth.official_description);
      const classification = classifyScore(sim);

      const finding: InaccuracyFinding = {
        category: "business_description",
        claim: p.business_description.slice(0, 200),
        expected: groundTruth.official_description.slice(0, 200),
        classification,
        model_id: result.model_id,
        explanation: `Model description has ${Math.round(sim * 100)}% overlap with official description.`,
      };

      routeFinding(finding, inaccuracies, partial_matches, unverifiable_claims);
    }

    // 3. Check services
    if (groundTruth.official_services && groundTruth.official_services.length > 0) {
      checkListAccuracy(
        "services",
        p.services_mentioned,
        groundTruth.official_services,
        result.model_id,
        inaccuracies,
        partial_matches,
        unverifiable_claims,
      );
    }

    // 4. Check locations
    if (groundTruth.official_locations && groundTruth.official_locations.length > 0) {
      checkListAccuracy(
        "locations",
        p.locations_mentioned,
        groundTruth.official_locations,
        result.model_id,
        inaccuracies,
        partial_matches,
        unverifiable_claims,
      );
    }

    // 5. Check industries
    if (groundTruth.official_industries && groundTruth.official_industries.length > 0) {
      checkListAccuracy(
        "industries",
        p.industries_mentioned,
        groundTruth.official_industries,
        result.model_id,
        inaccuracies,
        partial_matches,
        unverifiable_claims,
      );
    }

    // 6. Check differentiators
    if (groundTruth.official_differentiators && groundTruth.official_differentiators.length > 0) {
      checkListAccuracy(
        "differentiators",
        p.differentiators_mentioned,
        groundTruth.official_differentiators,
        result.model_id,
        inaccuracies,
        partial_matches,
        unverifiable_claims,
      );
    }

    // 7. Flag additional claims as unverifiable if we can't match them
    for (const claim of p.additional_claims) {
      const allGroundTruthText = [
        groundTruth.official_description || "",
        ...(groundTruth.official_services || []),
        ...(groundTruth.official_locations || []),
        ...(groundTruth.official_industries || []),
        ...(groundTruth.official_differentiators || []),
      ].join(" ");

      const matchScore = fuzzyContains(allGroundTruthText, claim);
      if (matchScore < 0.3) {
        unverifiable_claims.push({
          category: "additional_claims",
          claim,
          expected: "Not found in ground truth",
          classification: "unverifiable",
          model_id: result.model_id,
          explanation: `This claim could not be verified against the provided ground truth data.`,
        });
      }
    }
  }

  // Calculate accuracy score: ratio of accurate items to total checked items
  const totalFindings = inaccuracies.length + partial_matches.length + unverifiable_claims.length;
  // Count how many model+category combos we checked
  const totalChecks = successful.length * countGroundTruthDimensions(groundTruth);
  const accurateChecks = Math.max(0, totalChecks - inaccuracies.length - partial_matches.length);
  const accuracy_score = totalChecks > 0 ? Math.round((accurateChecks / totalChecks) * 100) : 100;

  return { inaccuracies, partial_matches, unverifiable_claims, accuracy_score };
}

// ── Internal helpers ─────────────────────────────────────────────

function classifyScore(score: number): AccuracyClassification {
  if (score >= 0.7) return "accurate";
  if (score >= 0.4) return "partially_accurate";
  if (score > 0) return "inaccurate";
  return "unverifiable";
}

function routeFinding(
  finding: InaccuracyFinding,
  inaccuracies: InaccuracyFinding[],
  partial_matches: InaccuracyFinding[],
  unverifiable_claims: InaccuracyFinding[],
): void {
  switch (finding.classification) {
    case "inaccurate":
      inaccuracies.push(finding);
      break;
    case "partially_accurate":
      partial_matches.push(finding);
      break;
    case "unverifiable":
      unverifiable_claims.push(finding);
      break;
    // "accurate" findings are not flagged — they're the expected case
  }
}

/**
 * Check if a model's text mentions the expected string.
 */
function checkStringAccuracy(
  category: string,
  modelText: string,
  expected: string,
  modelId: string,
  inaccuracies: InaccuracyFinding[],
  partial_matches: InaccuracyFinding[],
): void {
  const score = fuzzyContains(modelText, expected);
  if (score < 0.4) {
    inaccuracies.push({
      category,
      claim: `Model text does not clearly reference "${expected}"`,
      expected,
      classification: "inaccurate",
      model_id: modelId,
      explanation: `Expected "${expected}" but the model text has only ${Math.round(score * 100)}% overlap.`,
    });
  } else if (score < 0.7) {
    partial_matches.push({
      category,
      claim: `Model partially references "${expected}"`,
      expected,
      classification: "partially_accurate",
      model_id: modelId,
      explanation: `Partial match (${Math.round(score * 100)}% overlap) for "${expected}".`,
    });
  }
}

/**
 * Check model's mentioned items against ground truth items.
 * Items mentioned by model but not in ground truth = potentially inaccurate.
 * Items in ground truth but not mentioned = handled by gap detector (not here).
 */
function checkListAccuracy(
  category: string,
  modelItems: string[],
  groundTruthItems: string[],
  modelId: string,
  inaccuracies: InaccuracyFinding[],
  partial_matches: InaccuracyFinding[],
  unverifiable_claims: InaccuracyFinding[],
): void {
  // For each item the model claims, check if it matches ground truth
  for (const claimed of modelItems) {
    const best = bestMatch(claimed, groundTruthItems);

    if (best.score >= 0.7) {
      // Accurate — matches ground truth. No finding needed.
      continue;
    } else if (best.score >= 0.4) {
      partial_matches.push({
        category,
        claim: claimed,
        expected: best.match || "No close match",
        classification: "partially_accurate",
        model_id: modelId,
        explanation: `"${claimed}" partially matches "${best.match}" (${Math.round(best.score * 100)}% similarity).`,
      });
    } else {
      // Model claims something not in ground truth — could be inaccurate or just extra
      unverifiable_claims.push({
        category,
        claim: claimed,
        expected: "Not found in ground truth",
        classification: "unverifiable",
        model_id: modelId,
        explanation: `"${claimed}" was mentioned by the model but has no close match in the provided ground truth for ${category}.`,
      });
    }
  }
}

function countGroundTruthDimensions(gt: GroundTruth): number {
  let count = 0;
  if (gt.official_business_name) count++;
  if (gt.official_description) count++;
  if (gt.official_services && gt.official_services.length > 0) count++;
  if (gt.official_locations && gt.official_locations.length > 0) count++;
  if (gt.official_industries && gt.official_industries.length > 0) count++;
  if (gt.official_differentiators && gt.official_differentiators.length > 0) count++;
  return Math.max(count, 1); // Avoid division by zero
}
