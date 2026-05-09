/**
 * @fileOverview Model Result repository.
 * All Prisma queries for the model_results table.
 * Results are always cascade-deleted with their parent scan.
 */

import { db } from "@/lib/db";
import type { ModelResult } from "@prisma/client";
import type { ModelResponse } from "@/lib/types/perception-scan";

export const ModelResultRepository = {
  /**
   * Bulk-insert all model results for a scan in a single transaction.
   */
  async createMany(
    perceptionScanId: string,
    results: ModelResponse[],
  ): Promise<void> {
    await db.modelResult.createMany({
      data: results.map((r) => ({
        perceptionScanId,
        modelId: r.model_id,
        provider: r.provider,
        success: r.success,
        rawResponse: r.raw_response || null,
        summary: r.summary || null,
        businessDescription: r.perception.business_description || null,
        businessType: r.perception.business_type || null,
        servicesMentioned: r.perception.services_mentioned,
        industriesMentioned: r.perception.industries_mentioned,
        locationsMentioned: r.perception.locations_mentioned,
        customerTypesMentioned: r.perception.customer_types_mentioned,
        differentiatorsMentioned: r.perception.differentiators_mentioned,
        additionalClaims: r.perception.additional_claims,
        latencyMs: r.latency_ms || null,
        errorMessage: r.error_message || null,
      })),
    });
  },

  async findByScan(perceptionScanId: string): Promise<ModelResult[]> {
    return db.modelResult.findMany({
      where: { perceptionScanId },
      orderBy: { createdAt: "asc" },
    });
  },

  async findSuccessfulByScan(perceptionScanId: string): Promise<ModelResult[]> {
    return db.modelResult.findMany({
      where: { perceptionScanId, success: true },
      orderBy: { createdAt: "asc" },
    });
  },
};
