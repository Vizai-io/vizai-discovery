/**
 * @fileOverview GET /api/cron/scan-timeout
 *
 * Detects stuck scans and marks them TIMEOUT.
 *
 * A scan is considered stuck when its status is RUNNING and its
 * updatedAt timestamp is older than TIMEOUT_MINUTES (30 min). This
 * covers the case where a scan starts but the process crashes, times
 * out, or is otherwise lost — Vercel's 120s maxDuration ensures the
 * runner itself can't hang past 2 minutes, so any RUNNING scan older
 * than 30 minutes is definitively stuck.
 *
 * Security: CRON_SECRET header required. Register this route in
 * vercel.json crons or an external scheduler.
 *
 * Effects:
 *  - Marks stuck RUNNING scans → TIMEOUT
 *  - Fires a SCAN_FAILED notification per affected org (fire-and-forget)
 *
 * No auto-retry loops. Timeout is rare and deterministic. Users see
 * a calm failure card and can run a fresh scan.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NotificationService } from "@/lib/services/notification.service";
import { authorizeCronRequest } from "@/lib/cron/runtime";

const TIMEOUT_MINUTES = 30;
const TIMEOUT_MS = TIMEOUT_MINUTES * 60 * 1000;

export async function GET(request: Request) {
  // ── Auth gate — CRON_SECRET header ───────────────────────────
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const cutoff = new Date(Date.now() - TIMEOUT_MS);

    // Find all RUNNING scans whose updatedAt predates the cutoff
    const stuckScans = await db.perceptionScan.findMany({
      where: {
        status: "RUNNING",
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        organizationId: true,
        companyProfile: { select: { businessName: true } },
      },
    });

    if (stuckScans.length === 0) {
      return NextResponse.json({ marked: 0 });
    }

    // Mark each stuck scan TIMEOUT in a single transaction
    await db.perceptionScan.updateMany({
      where: { id: { in: stuckScans.map((s) => s.id) } },
      data: {
        status: "TIMEOUT",
        errorMessage: `Scan exceeded ${TIMEOUT_MINUTES}-minute execution window and was automatically timed out.`,
      },
    });

    // Fire notifications (fire-and-forget, never crashes the cron)
    void (async () => {
      try {
        for (const scan of stuckScans) {
          const businessName = scan.companyProfile?.businessName ?? "your account";
          await NotificationService.scanFailed(
            scan.organizationId,
            businessName,
            `Scan timed out after ${TIMEOUT_MINUTES} minutes. Your data is safe — run a fresh scan to get updated results.`,
          );
        }
      } catch (err) {
        console.error("[cron/scan-timeout] Notification error (non-fatal):", err);
      }
    })();

    console.log(`[cron/scan-timeout] Marked ${stuckScans.length} scan(s) as TIMEOUT`);

    return NextResponse.json({ marked: stuckScans.length });
  } catch (err: any) {
    console.error("[cron/scan-timeout] Error:", err);
    return NextResponse.json(
      { error: err.message || "Timeout cron failed" },
      { status: 500 },
    );
  }
}
