/**
 * @fileOverview Gap / Omission Detection Engine.
 *
 * Detects important business facts present in ground truth but missing
 * from one or more model responses. The flip side of inaccuracy detection:
 * inaccuracy = model says something wrong; omission = model doesn't say something important.
 */

import type {
  ModelResponse,
  GroundTruth,
  OmissionReport,
  Omission,
  OmissionSeverity,
} from "@/lib/types/perception-scan";
import { bestMatch, fuzzyContains } from "./string-utils";

/**
 * Detect omissions in model responses relative to ground truth.
 */
export function detectOmissions(
  results: ModelResponse[],
  groundTruth: GroundTruth,
): OmissionReport {
  const successful = results.filter((r) => r.success);

  if (successful.length === 0) {
    return { omissions: [], coverage_score: 0 };
  }

  const omissions: Omission[] = [];

  // 1. Check services omissions (major — these are what the business sells)
  if (groundTruth.official_services && groundTruth.official_services.length > 0) {
    checkListOmissions(
      "services",
      groundTruth.official_services,
      successful,
      (r) => r.perception.services_mentioned,
      "major", // Missing a core service is always major
      omissions,
    );
  }

  // 2. Check location omissions
  if (groundTruth.official_locations && groundTruth.official_locations.length > 0) {
    checkListOmissions(
      "locations",
      groundTruth.official_locations,
      successful,
      (r) => r.perception.locations_mentioned,
      "minor", // Missing a location is typically less critical
      omissions,
    );
  }

  // 3. Check industry omissions (major — determines how the business is categorized)
  if (groundTruth.official_industries && groundTruth.official_industries.length > 0) {
    checkListOmissions(
      "industries",
      groundTruth.official_industries,
      successful,
      (r) => r.perception.industries_mentioned,
      "major",
      omissions,
    );
  }

  // 4. Check differentiator omissions
  if (groundTruth.official_differentiators && groundTruth.official_differentiators.length > 0) {
    checkListOmissions(
      "differentiators",
      groundTruth.official_differentiators,
      successful,
      (r) => r.perception.differentiators_mentioned,
      "minor",
      omissions,
    );
  }

  // 5. Check business name mention (major if the model doesn't even know the name)
  if (groundTruth.official_business_name) {
    const missingIn: string[] = [];
    for (const r of successful) {
      const score = fuzzyContains(r.perception.business_description, groundTruth.official_business_name);
      if (score < 0.4) {
        missingIn.push(r.model_id);
      }
    }
    if (missingIn.length > 0) {
      omissions.push({
        category: "business_name",
        item: groundTruth.official_business_name,
        severity: "major",
        missing_in_models: missingIn,
        explanation: `The official business name "${groundTruth.official_business_name}" was not clearly mentioned by ${missingIn.length} model(s).`,
      });
    }
  }

  // 6. Check if official description themes are covered
  if (groundTruth.official_description) {
    const missingIn: string[] = [];
    for (const r of successful) {
      const score = fuzzyContains(r.perception.business_description, groundTruth.official_description);
      if (score < 0.3) {
        missingIn.push(r.model_id);
      }
    }
    if (missingIn.length > 0) {
      omissions.push({
        category: "business_description",
        item: "Core business description themes",
        severity: "major",
        missing_in_models: missingIn,
        explanation: `The official description's key themes are not reflected in ${missingIn.length} model(s)' descriptions.`,
      });
    }
  }

  // Calculate coverage score: what % of ground truth items are mentioned by at least one model
  const totalItems = countGroundTruthItems(groundTruth);
  const majorOmissions = omissions.filter((o) => o.severity === "major").length;
  const minorOmissions = omissions.filter((o) => o.severity === "minor").length;
  // Major omissions penalize more heavily
  const penaltyPoints = majorOmissions * 15 + minorOmissions * 5;
  const coverage_score = Math.max(0, Math.min(100, 100 - penaltyPoints));

  return { omissions, coverage_score };
}

// ── Internal helpers ─────────────────────────────────────────────

function checkListOmissions(
  category: string,
  groundTruthItems: string[],
  results: ModelResponse[],
  getModelItems: (r: ModelResponse) => string[],
  defaultSeverity: OmissionSeverity,
  omissions: Omission[],
): void {
  for (const expected of groundTruthItems) {
    const missingIn: string[] = [];

    for (const result of results) {
      const modelItems = getModelItems(result);
      const best = bestMatch(expected, modelItems);

      // Also check if it's mentioned in the raw description text
      const inDescription = fuzzyContains(result.perception.business_description, expected);
      const inRaw = fuzzyContains(result.raw_response, expected);

      // If it's not in the structured list AND not clearly in description/raw
      if (best.score < 0.5 && inDescription < 0.5 && inRaw < 0.5) {
        missingIn.push(result.model_id);
      }
    }

    if (missingIn.length > 0) {
      // If ALL models miss it, upgrade to major severity
      const severity: OmissionSeverity =
        missingIn.length === results.length ? "major" : defaultSeverity;

      omissions.push({
        category,
        item: expected,
        severity,
        missing_in_models: missingIn,
        explanation: `"${expected}" from ground truth ${category} is not mentioned by ${missingIn.length} of ${results.length} model(s).`,
      });
    }
  }
}

function countGroundTruthItems(gt: GroundTruth): number {
  let count = 0;
  if (gt.official_business_name) count++;
  if (gt.official_description) count++;
  count += gt.official_services?.length || 0;
  count += gt.official_locations?.length || 0;
  count += gt.official_industries?.length || 0;
  count += gt.official_differentiators?.length || 0;
  return Math.max(count, 1);
}
