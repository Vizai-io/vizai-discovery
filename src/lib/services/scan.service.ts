/**
 * @fileOverview Scan Service.
 *
 * Bridge between the perception scan engine and the Postgres repository layer.
 * This is the single entry point for running a scan from an API route.
 *
 * Responsibilities:
 * 1. Create the initial scan record in Postgres
 * 2. Run the scan engine (unchanged orchestrator)
 * 3. Persist all results to Postgres (model results, report, recommendations)
 * 4. Return the scan ID and full result
 *
 * Refinement 1: All log statements include a traceId for request correlation.
 * Refinement 5: Post-persist integrity assertion block validates that all
 *   expected Postgres rows were written. Emits SCAN_PIPELINE_INCOMPLETE if any
 *   stage is missing — non-fatal, never throws.
 *
 * Persistence destination: POSTGRES ONLY.
 * No Firestore writes exist in this service or its call chain.
 */

import {
  runPerceptionScan,
  type ScanProgress,
} from "@/lib/services/perception/scan-orchestrator";
import {
  PerceptionScanRepository,
  ModelResultRepository,
  ScanReportRepository,
  RecommendationRepository,
} from "@/lib/repositories";
import { db } from "@/lib/db";
import type {
  PerceptionScanInput,
  PerceptionScanResult,
} from "@/lib/types/perception-scan";

export interface RunScanOptions {
  organizationId: string;
  companyProfileId: string;
  input: PerceptionScanInput;
  onProgress?: (progress: ScanProgress) => Promise<void>;
}

export interface RunScanResult {
  scanId: string;
  result: PerceptionScanResult;
}

/**
 * Run a full perception scan and persist all results to Postgres.
 *
 * Throws if the scan cannot be created or if all models fail.
 * Individual model failures are handled inside the engine — they do NOT throw.
 */
export async function runAndPersistScan(
  options: RunScanOptions,
): Promise<RunScanResult> {
  const traceId = crypto.randomUUID();
  const { organizationId, companyProfileId, input } = options;

  // ── Step 1: Create the initial scan record ─────────────────────────────────
  const scan = await PerceptionScanRepository.create({
    organizationId,
    companyProfileId,
    promptUsed: input.prompt ?? "",
    modelsRequested: input.models ?? [],
    isSimulated: false,
  });

  const scanId = scan.id;

  console.log("[scan.service] Scan created", {
    traceId,
    scanId,
    organizationId,
    companyProfileId,
    phase: "created",
  });

  // ── Step 2: Progress forwarding ────────────────────────────────────────────
  const onProgress = async (progress: ScanProgress) => {
    try {
      await PerceptionScanRepository.updateStep(scanId, progress.step);
    } catch {
      // Non-critical — don't fail the scan if progress updates fail
    }
    await options.onProgress?.(progress);
  };

  await PerceptionScanRepository.updateStatus(scanId, "RUNNING", "Initializing scan...");

  // ── Step 3: Run the scan engine ────────────────────────────────────────────
  let result: PerceptionScanResult;
  try {
    result = await runPerceptionScan(input, scanId, onProgress);
  } catch (err: any) {
    console.error("[scan.service] Scan engine error", {
      traceId,
      scanId,
      phase: "engine_execution",
      error: err?.message,
    });
    await PerceptionScanRepository.markFailed(scanId, err.message ?? "Unknown error");
    throw err;
  }

  // ── Step 4: Persist results to Postgres ────────────────────────────────────
  if (result.status === "complete") {
    try {
      const failedModelCount = result.model_results.filter((r) => !r.success).length;
      const hasReport = !!result.comparison?.perception_summary;
      const finalStatus: "COMPLETE" | "PARTIAL" =
        failedModelCount > 0 && hasReport ? "PARTIAL" : "COMPLETE";

      await PerceptionScanRepository.updateStatus(
        scanId,
        finalStatus,
        finalStatus === "PARTIAL" ? "Partial results" : "Complete",
      );

      await db.perceptionScan.update({
        where: { id: scanId },
        data: {
          promptUsed: result.prompt_used,
          modelsRequested: result.models_requested,
          completedAt: new Date(),
        },
      });

      // Persist model results, report, and recommendations in parallel
      await Promise.all([
        ModelResultRepository.createMany(scanId, result.model_results),
        ScanReportRepository.createFromResult(scanId, result),
        RecommendationRepository.createMany(scanId, result.recommendations),
      ]);

      console.log("[scan.service] Scan persisted", {
        traceId,
        scanId,
        finalStatus,
        modelCount: result.model_results.length,
        failedModelCount,
        recommendationCount: result.recommendations.length,
        phase: "persisted",
      });

      // ── Step 5: Integrity assertion (Refinement 5) ─────────────────────────
      // Validates that all expected Postgres rows were actually written.
      // Non-fatal — never throws. Emits SCAN_PIPELINE_INCOMPLETE on gaps.
      void (async () => {
        try {
          const [modelResultCount, reportCount, recommendationCount] = await Promise.all([
            db.modelResult.count({ where: { perceptionScanId: scanId } }),
            db.scanReport.count({ where: { perceptionScanId: scanId } }),
            db.recommendation.count({ where: { perceptionScanId: scanId } }),
          ]);

          const scanExists = await db.perceptionScan.findUnique({
            where: { id: scanId },
            select: { id: true, status: true },
          });

          const missingStages: string[] = [];
          if (!scanExists) missingStages.push("perceptionScan");
          if (modelResultCount === 0) missingStages.push("modelResults");
          if (reportCount === 0) missingStages.push("scanReport");
          if (recommendationCount === 0) missingStages.push("recommendations");

          if (missingStages.length > 0) {
            console.error("[SCAN_PIPELINE_INCOMPLETE]", {
              traceId,
              scanId,
              organizationId,
              missingStages,
              persistenceDestination: "postgres",
              modelResultCount,
              reportCount,
              recommendationCount,
            });
          } else {
            console.log("[scan.service] Pipeline integrity OK", {
              traceId,
              scanId,
              modelResultCount,
              reportCount,
              recommendationCount,
              phase: "integrity_check",
            });
          }
        } catch (assertErr: any) {
          // Integrity check itself failed — log but never surface to caller
          console.error("[scan.service] Integrity assertion failed to run", {
            traceId,
            scanId,
            error: assertErr?.message,
          });
        }
      })();
    } catch (persistErr: any) {
      console.error("[scan.service] Persistence failure", {
        traceId,
        scanId,
        phase: "persistence",
        error: persistErr?.message,
      });
      await PerceptionScanRepository.markFailed(
        scanId,
        `Scan completed but failed to save results: ${persistErr.message}`,
      );
      throw persistErr;
    }
  } else {
    // Engine returned status: "failed"
    console.error("[scan.service] Engine returned failed status", {
      traceId,
      scanId,
      engineError: result.error,
      phase: "engine_failed",
    });
    await PerceptionScanRepository.markFailed(
      scanId,
      result.error ?? "Scan engine returned failed status",
    );
  }

  return { scanId, result };
}
