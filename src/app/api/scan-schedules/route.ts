/**
 * @fileOverview /api/scan-schedules
 *
 * GET  — List all scan schedules for the authenticated org (active + inactive),
 *         with company profile name included.
 *
 * POST — Create a new scan schedule for a company profile.
 *         Enforces one active schedule per profile.
 *         Admin-only.
 *
 * Authentication required. All operations are org-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { ScanScheduleRepository, CompanyProfileRepository, OrganizationRepository } from "@/lib/repositories";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { computeNextRunAt } from "@/lib/utils/schedule";
import { getOrganizationAccessState } from "@/lib/stripe";
import type { RecurrenceInterval } from "@prisma/client";

const VALID_INTERVALS: RecurrenceInterval[] = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"];

function formatSchedule(
  s: Awaited<ReturnType<typeof ScanScheduleRepository.findAllByOrgWithProfile>>[number],
) {
  return {
    id: s.id,
    company_profile_id: s.companyProfileId,
    business_name: s.companyProfile.businessName,
    website_url: s.companyProfile.websiteUrl,
    interval: s.interval,
    is_active: s.isActive,
    next_run_at: s.nextRunAt,
    last_run_at: s.lastRunAt,
    models_to_use: s.modelsToUse,
    created_at: s.createdAt,
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ schedules: [] });
    }

    const schedules = await ScanScheduleRepository.findAllByOrgWithProfile(auth.organizationId);

    return NextResponse.json({
      schedules: schedules.map(formatSchedule),
      total: schedules.length,
    });
  } catch (err: any) {
    console.error("Error listing scan schedules:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list scan schedules" },
      { status: 500 },
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json(
        { error: "Account not yet assigned to an organization. Complete onboarding first." },
        { status: 403 },
      );
    }
    if (auth.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required to create scan schedules." },
        { status: 403 },
      );
    }

    // ── Entitlement check ─────────────────────────────────────
    const org = await OrganizationRepository.findById(auth.organizationId);
    if (org) {
      const access = getOrganizationAccessState(org);
      if (!access.canCreateSchedules) {
        return NextResponse.json(
          { error: access.warning ?? "Subscription inactive. Upgrade to create schedules." },
          { status: 403 },
        );
      }
    }

    const body = await request.json();
    const { company_profile_id, interval, models_to_use } = body;

    // ── Validate ──────────────────────────────────────────────
    if (!company_profile_id || typeof company_profile_id !== "string") {
      return NextResponse.json(
        { error: "Missing required field: company_profile_id" },
        { status: 400 },
      );
    }
    if (!interval || !VALID_INTERVALS.includes(interval as RecurrenceInterval)) {
      return NextResponse.json(
        { error: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(", ")}` },
        { status: 400 },
      );
    }

    // ── Verify profile belongs to this org ────────────────────
    const profile = await CompanyProfileRepository.findById(
      company_profile_id,
      auth.organizationId,
    );
    if (!profile) {
      return NextResponse.json(
        { error: "Company profile not found or access denied." },
        { status: 404 },
      );
    }

    // ── One active schedule per profile ───────────────────────
    const existing = await ScanScheduleRepository.findByProfile(
      company_profile_id,
      auth.organizationId,
    );
    const activeExisting = existing.filter((s) => s.isActive);
    if (activeExisting.length > 0) {
      return NextResponse.json(
        {
          error:
            "An active schedule already exists for this profile. Disable it before creating a new one, or update the existing schedule.",
          existing_schedule_id: activeExisting[0].id,
        },
        { status: 409 },
      );
    }

    // ── Create ────────────────────────────────────────────────
    const schedule = await ScanScheduleRepository.create({
      organizationId: auth.organizationId,
      companyProfileId: company_profile_id,
      interval: interval as RecurrenceInterval,
      nextRunAt: computeNextRunAt(interval as RecurrenceInterval),
      modelsToUse: Array.isArray(models_to_use) ? models_to_use : [],
    });

    return NextResponse.json(
      {
        id: schedule.id,
        company_profile_id: schedule.companyProfileId,
        interval: schedule.interval,
        is_active: schedule.isActive,
        next_run_at: schedule.nextRunAt,
        created_at: schedule.createdAt,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Error creating scan schedule:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create scan schedule" },
      { status: 500 },
    );
  }
}
