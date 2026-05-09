/**
 * @fileOverview /api/scan-schedules/:id
 *
 * PATCH  — Update a scan schedule (interval, isActive, modelsToUse).
 *           Recomputes nextRunAt when interval changes or schedule is re-enabled.
 *           Admin-only.
 *
 * DELETE — Disable a scan schedule (sets isActive = false). Admin-only.
 *
 * Both operations are org-scoped. Cross-org access returns 404.
 */

import { NextRequest, NextResponse } from "next/server";
import { ScanScheduleRepository } from "@/lib/repositories";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { computeNextRunAt } from "@/lib/utils/schedule";
import { db } from "@/lib/db";
import type { RecurrenceInterval } from "@prisma/client";

const VALID_INTERVALS: RecurrenceInterval[] = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"];

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { interval, is_active, models_to_use } = body;

    // ── Verify org scope ──────────────────────────────────────
    const existing = await ScanScheduleRepository.findById(id, auth.organizationId);
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    }

    // ── Validate interval if provided ─────────────────────────
    if (interval !== undefined && !VALID_INTERVALS.includes(interval as RecurrenceInterval)) {
      return NextResponse.json(
        { error: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(", ")}` },
        { status: 400 },
      );
    }

    // ── Build update payload ──────────────────────────────────
    const newInterval: RecurrenceInterval =
      interval !== undefined ? (interval as RecurrenceInterval) : existing.interval;
    const newIsActive: boolean =
      is_active !== undefined ? Boolean(is_active) : existing.isActive;

    // Recompute nextRunAt if:
    //   - interval changed, OR
    //   - schedule is being re-enabled (was disabled, now active)
    const intervalChanged = interval !== undefined && interval !== existing.interval;
    const beingEnabled = is_active === true && !existing.isActive;
    const recomputeNext = intervalChanged || beingEnabled;

    const updated = await db.scanSchedule.update({
      where: { id },
      data: {
        interval: newInterval,
        isActive: newIsActive,
        modelsToUse: Array.isArray(models_to_use) ? models_to_use : existing.modelsToUse,
        ...(recomputeNext ? { nextRunAt: computeNextRunAt(newInterval) } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      interval: updated.interval,
      is_active: updated.isActive,
      next_run_at: updated.nextRunAt,
      last_run_at: updated.lastRunAt,
      models_to_use: updated.modelsToUse,
      updated_at: updated.updatedAt,
    });
  } catch (err: any) {
    console.error("Error updating scan schedule:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update scan schedule" },
      { status: 500 },
    );
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { id } = await params;

    await ScanScheduleRepository.setActive(id, auth.organizationId, false);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "Scan schedule not found or access denied") {
      return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    }
    console.error("Error disabling scan schedule:", err);
    return NextResponse.json(
      { error: err.message || "Failed to disable scan schedule" },
      { status: 500 },
    );
  }
}
