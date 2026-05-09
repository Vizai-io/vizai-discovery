/**
 * @fileOverview Scan Report repository.
 * All Prisma queries for the scan_reports table.
 * One report per scan (unique constraint on perceptionScanId).
 */

import { db } from "@/lib/db";
import type { ScanReport, ConsistencyLabel } from "@prisma/client";
import type { PerceptionScanResult } from "@/lib/types/perception-scan";

export const ScanReportRepository = {
  /**
   * Create the report from the full scan result.
   * Maps the scan engine output types to the flat Postgres columns.
   */
  async createFromResult(
    perceptionScanId: string,
    result: PerceptionScanResult,
  ): Promise<ScanReport> {
    const consistencyLabelMap: Record<string, ConsistencyLabel> = {
      "high agreement": "HIGH_AGREEMENT",
      "moderate divergence": "MODERATE_DIVERGENCE",
      "significant divergence": "SIGNIFICANT_DIVERGENCE",
      "extreme divergence": "EXTREME_DIVERGENCE",
    };

    return db.scanReport.create({
      data: {
        perceptionScanId,
        perceptionSummary: result.comparison.perception_summary,
        agreements: result.comparison.comparison.agreements as any,
        differences: result.comparison.comparison.differences as any,
        conflicts: result.comparison.comparison.conflicts as any,
        accuracyScore: result.inaccuracy_report.accuracy_score,
        coverageScore: result.omission_report.coverage_score,
        entityUnderstandingScore: result.entity_understanding.overall_score,
        consistencyScore: result.consistency.consistency_score,
        consistencyLabel:
          consistencyLabelMap[result.consistency.consistency_label] ??
          "HIGH_AGREEMENT",
        consistencyNotes: result.consistency.consistency_notes,
        inaccuracyDetail: result.inaccuracy_report as any,
        omissionDetail: result.omission_report as any,
        entityUnderstanding: result.entity_understanding as any,
        markdownReport: result.markdown_report || null,
        jsonReport: result.json_report as any || null,
      },
    });
  },

  async findByScan(perceptionScanId: string): Promise<ScanReport | null> {
    return db.scanReport.findUnique({ where: { perceptionScanId } });
  },
};
