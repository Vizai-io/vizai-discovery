/**
 * @fileOverview POST /api/cron/scan-runner
 *
 * Cron-triggered endpoint that finds all due scan schedules and runs them.
 *
 * Security:
 *   Requires `Authorization: Bearer <CRON_SECRET>` header.
 *   Set CRON_SECRET in environment. Returns 401 if missing or wrong.
 *
 * Execution model:
 *   - Synchronous per schedule (no queue)
 *   - Individual schedule failures do NOT abort the run — errors are logged
 *     and counted, execution continues to the next schedule
 *   - Returns a full execution summary
 *
 * Intended caller:
 *   Vercel cron, Supabase pg_cron, or any external scheduler.
 *   Must POST to this URL with the correct Authorization header.
 *
 * Example cron config (vercel.json):
 * {
 *   "crons": [{ "path": "/api/cron/scan-runner", "schedule": "0 * * * *" }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { ScanScheduleRepository, CompanyProfileRepository } from "@/lib/repositories";
import { runAndPersistScan } from "@/lib/services/scan.service";
import { computeNextRunAt } from "@/lib/utils/schedule";
import { sendNotification } from "@/lib/notifications";
import { NotificationService } from "@/lib/services/notification.service";
import { computeScanDelta } from "@/lib/services/scan-delta.service";
import { RecommendationRepository } from "@/lib/repositories";
import { db } from "@/lib/db";
import type { PerceptionScanInput } from "@/lib/types/perception-scan";

// Allow up to 5 minutes — synchronous execution across multiple schedules
export const maxDuration = 300;

type RunResult = {
  schedule_id: string;
  company_profile_id: string;
  business_name: string;
  status: "success" | "failed";
  scan_id?: string;
  error?: string;
};

export async function POST(request: NextRequest) {
  // ── Security gate ──────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Find due schedules ─────────────────────────────────────
  let dueSchedules;
  try {
    dueSchedules = await ScanScheduleRepository.findDue();
  } catch (err: any) {
    console.error("[cron/scan-runner] Failed to fetch due schedules:", err);
    return NextResponse.json(
      { error: "Failed to fetch due schedules", detail: err.message },
      { status: 500 },
    );
  }

  if (dueSchedules.length === 0) {
    return NextResponse.json({ ran: 0, failed: 0, results: [], message: "No schedules due." });
  }

  console.log(`[cron/scan-runner] ${dueSchedules.length} schedule(s) due.`);

  const results: RunResult[] = [];

  // ── Execute each due schedule ──────────────────────────────
  for (const schedule of dueSchedules) {
    const result: RunResult = {
      schedule_id: schedule.id,
      company_profile_id: schedule.companyProfileId,
      business_name: "",
      status: "failed",
    };

    try {
      // Fetch company profile — provides ground truth and identity
      const profile = await CompanyProfileRepository.findById(
        schedule.companyProfileId,
        schedule.organizationId,
      );

      if (!profile) {
        result.error = "Company profile not found or inactive";
        results.push(result);
        console.error(`[cron/scan-runner] Profile not found for schedule ${schedule.id}`);
        continue;
      }

      result.business_name = profile.businessName;

      // Build scan input from stored profile ground truth
      const input: PerceptionScanInput = {
        business_name: profile.businessName,
        website_url: profile.websiteUrl ?? undefined,
        organization_id: schedule.organizationId,
        models: schedule.modelsToUse.length > 0 ? schedule.modelsToUse : undefined,
        ground_truth: {
          official_business_name: profile.businessName,
          official_description: profile.officialDescription ?? undefined,
          official_services: profile.officialServices,
          official_locations: profile.officialLocations,
          official_industries: profile.officialIndustries,
          official_differentiators: profile.officialDifferentiators,
        },
      };

      // Run the perception scan
      const { scanId } = await runAndPersistScan({
        organizationId: schedule.organizationId,
        companyProfileId: schedule.companyProfileId,
        input,
      });

      result.scan_id = scanId;
      result.status = "success";

      // Advance the schedule
      await ScanScheduleRepository.updateAfterRun(
        schedule.id,
        computeNextRunAt(schedule.interval),
      );

      // ── Persist operational notifications ─────────────────
      // Fire-and-forget block — notification failures must not abort the run
      void (async () => {
        try {
          // 1. Scan completed notification
          await sendNotification({
            type: "scan_complete",
            organizationId: schedule.organizationId,
            scanId,
            businessName: profile.businessName,
          });

          // 2. Visibility delta notification (significant changes only)
          const lastTwo = await db.perceptionScan.findMany({
            where: {
              organizationId: schedule.organizationId,
              companyProfileId: schedule.companyProfileId,
              status: "COMPLETE",
            },
            orderBy: { createdAt: "desc" },
            take: 2,
            include: {
              scanReport: {
                select: {
                  accuracyScore: true,
                  coverageScore: true,
                  entityUnderstandingScore: true,
                  consistencyScore: true,
                },
              },
            },
          });

          if (lastTwo.length === 2 && lastTwo[0].scanReport && lastTwo[1].scanReport) {
            const delta = computeScanDelta(lastTwo[0].scanReport, lastTwo[1].scanReport);
            if (delta.significantImprovement) {
              await NotificationService.visibilityImproved(
                schedule.organizationId,
                scanId,
                profile.businessName,
                delta,
              );
            } else if (delta.significantDecline) {
              await NotificationService.visibilityDeclined(
                schedule.organizationId,
                scanId,
                profile.businessName,
                delta,
              );
            }
          }

          // 3. Recommendation backlog notification (24h cooldown)
          const openCount = await RecommendationRepository.countOpenByOrg(
            schedule.organizationId,
          );
          if (openCount >= 5) {
            await NotificationService.recommendationBacklogGrowing(
              schedule.organizationId,
              openCount,
            );
          }
        } catch (notifErr) {
          console.error("[cron/scan-runner] Notification error (non-fatal):", notifErr);
        }
      })();

      console.log(
        `[cron/scan-runner] ✓ schedule=${schedule.id} scan=${scanId} profile="${profile.businessName}"`,
      );
    } catch (err: any) {
      result.error = err.message ?? "Unknown error";
      console.error(
        `[cron/scan-runner] ✗ schedule=${schedule.id} error: ${result.error}`,
      );

      // Notify on scan failure (non-fatal — never throws)
      if (result.business_name) {
        void NotificationService.scanFailed(
          schedule.organizationId,
          result.business_name,
          result.error ?? "Unknown error",
        ).catch(() => {});
      }
    }

    results.push(result);
  }

  const ran = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log(`[cron/scan-runner] Done. ran=${ran} failed=${failed}`);

  return NextResponse.json({ ran, failed, results });
}
