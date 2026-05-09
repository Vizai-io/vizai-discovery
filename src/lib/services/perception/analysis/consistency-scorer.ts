/**
 * @fileOverview Consistency / Divergence Scorer.
 *
 * Produces a heuristic score from 0-100 showing how much models agree or diverge.
 *   0   = full agreement (no meaningful disagreement)
 *   100 = extreme disagreement
 *
 * The scoring is transparent and comment-heavy so it can be explained to clients.
 */

import type {
  ModelResponse,
  ConsistencyReport,
  ConsistencyLabel,
} from "@/lib/types/perception-scan";
import { jaccardSimilarity, listOverlap } from "./string-utils";

/**
 * Calculate a consistency score across all successful model responses.
 */
export function scoreConsistency(results: ModelResponse[]): ConsistencyReport {
  const successful = results.filter((r) => r.success);

  if (successful.length < 2) {
    return {
      consistency_score: 0,
      consistency_label: "high agreement",
      consistency_notes: [
        successful.length === 0
          ? "No successful model responses to compare."
          : "Only one model responded — consistency requires at least two models.",
      ],
    };
  }

  const notes: string[] = [];
  let totalPenalty = 0;
  let checksPerformed = 0;

  // ── 1. Business description similarity (weight: 25%) ──────────
  // Compare each pair of descriptions using Jaccard similarity
  {
    let pairCount = 0;
    let totalSim = 0;

    for (let i = 0; i < successful.length; i++) {
      for (let j = i + 1; j < successful.length; j++) {
        const sim = jaccardSimilarity(
          successful[i].perception.business_description,
          successful[j].perception.business_description,
        );
        totalSim += sim;
        pairCount++;
      }
    }

    const avgSim = pairCount > 0 ? totalSim / pairCount : 0;
    // Lower similarity = higher divergence penalty
    const descriptionPenalty = Math.round((1 - avgSim) * 25);
    totalPenalty += descriptionPenalty;
    checksPerformed++;

    if (avgSim < 0.4) {
      notes.push(`Business descriptions diverge significantly (${Math.round(avgSim * 100)}% similarity).`);
    } else if (avgSim < 0.7) {
      notes.push(`Business descriptions show moderate differences (${Math.round(avgSim * 100)}% similarity).`);
    }
  }

  // ── 2. Service mention overlap (weight: 25%) ──────────────────
  {
    const allServices = successful.flatMap((r) => r.perception.services_mentioned);
    const uniqueServices = [...new Set(allServices.map((s) => s.toLowerCase()))];

    if (uniqueServices.length > 0) {
      // For each pair, compute overlap ratio
      let pairCount = 0;
      let totalOverlap = 0;

      for (let i = 0; i < successful.length; i++) {
        for (let j = i + 1; j < successful.length; j++) {
          const setA = successful[i].perception.services_mentioned;
          const setB = successful[j].perception.services_mentioned;
          if (setA.length > 0 || setB.length > 0) {
            const overlap = listOverlap(
              setA.length > setB.length ? setA : setB,
              setA.length > setB.length ? setB : setA,
            );
            totalOverlap += overlap.ratio;
            pairCount++;
          }
        }
      }

      const avgOverlap = pairCount > 0 ? totalOverlap / pairCount : 0;
      const servicePenalty = Math.round((1 - avgOverlap) * 25);
      totalPenalty += servicePenalty;

      if (avgOverlap < 0.3) {
        notes.push(`Service mentions vary widely across models (${Math.round(avgOverlap * 100)}% overlap).`);
      }
    }
    checksPerformed++;
  }

  // ── 3. Geography overlap (weight: 15%) ────────────────────────
  {
    const allLocations = successful.flatMap((r) => r.perception.locations_mentioned);
    if (allLocations.length > 0) {
      let pairCount = 0;
      let totalOverlap = 0;

      for (let i = 0; i < successful.length; i++) {
        for (let j = i + 1; j < successful.length; j++) {
          const setA = successful[i].perception.locations_mentioned;
          const setB = successful[j].perception.locations_mentioned;
          if (setA.length > 0 || setB.length > 0) {
            const overlap = listOverlap(
              setA.length > setB.length ? setA : setB,
              setA.length > setB.length ? setB : setA,
            );
            totalOverlap += overlap.ratio;
            pairCount++;
          }
        }
      }

      const avgOverlap = pairCount > 0 ? totalOverlap / pairCount : 0;
      totalPenalty += Math.round((1 - avgOverlap) * 15);

      if (avgOverlap < 0.3) {
        notes.push(`Geographic coverage differs significantly between models.`);
      }
    }
    checksPerformed++;
  }

  // ── 4. Industry / categorization overlap (weight: 15%) ────────
  {
    let pairCount = 0;
    let totalSim = 0;

    for (let i = 0; i < successful.length; i++) {
      for (let j = i + 1; j < successful.length; j++) {
        const sim = jaccardSimilarity(
          successful[i].perception.business_type,
          successful[j].perception.business_type,
        );
        totalSim += sim;
        pairCount++;
      }
    }

    const avgSim = pairCount > 0 ? totalSim / pairCount : 0;
    totalPenalty += Math.round((1 - avgSim) * 15);
    checksPerformed++;

    if (avgSim < 0.4) {
      notes.push(`Models classify the business into different categories.`);
    }
  }

  // ── 5. Contradiction detection (weight: 20%) ──────────────────
  // Check for direct contradictions: same dimension, opposite claims
  {
    let contradictions = 0;

    // Check business type contradictions
    const types = successful.map((r) => r.perception.business_type).filter(Boolean);
    if (types.length >= 2) {
      const sim = jaccardSimilarity(types[0], types[types.length - 1]);
      if (sim < 0.15 && types[0].length > 3 && types[types.length - 1].length > 3) {
        contradictions++;
        notes.push(
          `Possible contradiction in business classification: "${types[0]}" vs "${types[types.length - 1]}".`
        );
      }
    }

    // Check if one model says "global" and another says a specific local region
    const locations = successful.map((r) => r.perception.locations_mentioned);
    const hasGlobal = locations.some((l) => l.some((loc) => loc.toLowerCase().includes("global")));
    const hasLocal = locations.some((l) =>
      l.some((loc) => !loc.toLowerCase().includes("global") && loc.length > 2)
    );
    if (hasGlobal && hasLocal) {
      // Not necessarily a contradiction — just worth noting
      notes.push("Models disagree on geographic scope (global vs. specific regions).");
    }

    totalPenalty += Math.min(20, contradictions * 10);
    checksPerformed++;
  }

  // Clamp to 0-100
  const consistency_score = Math.max(0, Math.min(100, totalPenalty));
  const consistency_label = scoreToLabel(consistency_score);

  if (notes.length === 0) {
    notes.push("Models show strong agreement across all dimensions.");
  }

  return { consistency_score, consistency_label, consistency_notes: notes };
}

// ── Label mapping ────────────────────────────────────────────────

function scoreToLabel(score: number): ConsistencyLabel {
  if (score <= 20) return "high agreement";
  if (score <= 45) return "moderate divergence";
  if (score <= 70) return "significant divergence";
  return "extreme divergence";
}
