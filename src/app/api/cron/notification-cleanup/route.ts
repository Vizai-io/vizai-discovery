/**
 * @fileOverview POST /api/cron/notification-cleanup
 *
 * Archives notifications older than 90 days, across all organizations.
 * Unread CRITICAL notifications are exempt from archival regardless of age.
 *
 * Security:
 *   Requires `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Schedule recommendation (vercel.json):
 *   { "path": "/api/cron/notification-cleanup", "schedule": "0 3 * * *" }
 *   → Runs at 03:00 UTC daily
 *
 * This is a maintenance operation. Return 200 on success.
 * No business logic — purely lifecycle management.
 */

import { NextRequest, NextResponse } from "next/server";
import { NotificationRepository } from "@/lib/repositories";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const archived = await NotificationRepository.archiveOldAll();
    console.log(`[cron/notification-cleanup] Archived ${archived} notification(s).`);
    return NextResponse.json({ ok: true, archived });
  } catch (err: any) {
    console.error("[cron/notification-cleanup] Failed:", err);
    return NextResponse.json(
      { error: err.message || "Cleanup failed" },
      { status: 500 },
    );
  }
}
