/**
 * @fileOverview POST /api/scan — Run a perception scan.
 *
 * Authentication required. Org-scoped — scans are always created under
 * the authenticated user's organization.
 *
 * Request body:
 * {
 *   business_name: string,       // required
 *   company_profile_id: string,  // required — Postgres company profile ID
 *   website_url?: string,
 *   prompt?: string,
 *   ground_truth?: { ... },
 *   models?: string[],
 * }
 *
 * Response:
 * {
 *   scan_id: string,
 *   status: "complete" | "failed",
 *   summary: { ... }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { runAndPersistScan } from "@/lib/services/scan.service";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { OrganizationRepository, RecommendationRepository } from "@/lib/repositories";
import { getOrganizationAccessState } from "@/lib/stripe";
import { NotificationService } from "@/lib/services/notification.service";
import { computeScanDelta } from "@/lib/services/scan-delta.service";
import { db } from "@/lib/db";
import type { PerceptionScanInput } from "@/lib/types/perception-scan";
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from "@/lib/services/operational-event-service";

export const maxDuration = 120;

// ── GET /api/scan — List scans for the authenticated org ──────────────────────
// Used by the history page and any future scan list views.
// Returns scans with COMPLETE or PARTIAL status, ordered newest-first.

export async function GET() {
  const traceId = crypto.randomUUID();

  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scans = await db.perceptionScan.findMany({
      where: {
        organizationId: auth.organizationId,
        status: { in: ["COMPLETE", "PARTIAL"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        scanReport: {
          select: {
            accuracyScore: true,
            coverageScore: true,
            entityUnderstandingScore: true,
            consistencyScore: true,
          },
        },
        companyProfile: {
          select: { businessName: true },
        },
      },
    });

    const payload = scans.map((s) => {
      const r = s.scanReport;
      const overallScore = r
        ? Math.round(
            (r.accuracyScore + r.coverageScore + r.entityUnderstandingScore + r.consistencyScore) /
              4,
          )
        : null;

      return {
        id: s.id,
        status: s.status,
        businessName: s.companyProfile?.businessName ?? null,
        createdAt: s.createdAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        overallScore,
        accuracyScore: r?.accuracyScore ?? null,
        coverageScore: r?.coverageScore ?? null,
        entityUnderstandingScore: r?.entityUnderstandingScore ?? null,
        consistencyScore: r?.consistencyScore ?? null,
      };
    });

    return NextResponse.json({ scans: payload });
  } catch (err: any) {
    console.error("[scan] GET list error", {
      traceId,
      error: err?.message,
    });
    return NextResponse.json({ error: "Failed to load scan history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const traceId = crypto.randomUUID();
  let scanId = "";

  try {
    // ── Auth gate — must precede all other work ───────────────
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json(
        { error: "Account not yet assigned to an organization. Contact your administrator." },
        { status: 403 },
      );
    }

    const body = await request.json();

    const {
      business_name,
      website_url,
      prompt,
      ground_truth,
      models,
      company_profile_id,
    } = body as PerceptionScanInput & { company_profile_id?: string };

    // ── Validate required inputs ──────────────────────────────
    if (
      !business_name ||
      typeof business_name !== "string" ||
      business_name.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Missing required field: business_name" },
        { status: 400 },
      );
    }

    if (ground_truth) {
      if (typeof ground_truth !== "object") {
        return NextResponse.json(
          { error: "ground_truth must be an object" },
          { status: 400 },
        );
      }
      const arrayFields = [
        "official_services",
        "official_locations",
        "official_industries",
        "official_differentiators",
      ] as const;
      for (const field of arrayFields) {
        if (ground_truth[field] && !Array.isArray(ground_truth[field])) {
          return NextResponse.json(
            { error: `ground_truth.${field} must be an array` },
            { status: 400 },
          );
        }
      }
    }

    // ── Entitlement check ─────────────────────────────────────
    const org = await OrganizationRepository.findById(auth.organizationId);
    if (org) {
      const access = getOrganizationAccessState(org);
      if (!access.canScan) {
        return NextResponse.json(
          { error: access.warning ?? "Subscription inactive. Upgrade to run scans." },
          { status: 403 },
        );
      }
    }

    // ── Resolve org / profile IDs ─────────────────────────────
    // company_profile_id is required — no sentinel fallback.
    if (!company_profile_id || typeof company_profile_id !== "string") {
      return NextResponse.json(
        { error: "Missing required field: company_profile_id" },
        { status: 400 },
      );
    }

    const orgId = auth.organizationId;

    // ── Duplicate-run protection ──────────────────────────────
    // One active scan per org at a time. Return 409 with a calm message
    // if a PENDING or RUNNING scan already exists.
    const activeScanCount = await db.perceptionScan.count({
      where: {
        organizationId: orgId,
        status: { in: ["PENDING", "RUNNING"] },
      },
    });
    if (activeScanCount > 0) {
      return NextResponse.json(
        {
          error:
            "We're already processing a scan for your organization. Please wait for it to complete before starting another.",
        },
        { status: 409 },
      );
    }
    const profileId = company_profile_id;

    const input: PerceptionScanInput = {
      business_name: business_name.trim(),
      website_url,
      prompt,
      ground_truth,
      models,
      organization_id: orgId,
    };

    // ── SCAN_STARTED — emitted before engine runs (no scanId yet) ────────────
    void OperationalEventService.emit({
      eventType:      EVENT_TYPES.SCAN_STARTED,
      severity:       SEVERITIES.INFO,
      source:         EVENT_SOURCES.SCAN_API,
      traceId,
      organizationId: orgId,
      entityType:     'org',
      entityId:       orgId,
      message:        `Authenticated scan started for "${business_name.trim()}"`,
      metadata: {
        businessName:     business_name.trim(),
        companyProfileId: profileId,
      },
    });

    // ── Run scan and persist to Postgres ──────────────────────
    const { scanId: id, result } = await runAndPersistScan({
      organizationId: orgId,
      companyProfileId: profileId,
      input,
    });

    scanId = id;

    // ── SCAN_COMPLETED ────────────────────────────────────────
    void OperationalEventService.emit({
      eventType:      EVENT_TYPES.SCAN_COMPLETED,
      severity:       SEVERITIES.INFO,
      source:         EVENT_SOURCES.SCAN_API,
      traceId,
      organizationId: orgId,
      entityType:     'scan',
      entityId:       scanId,
      message:        `Scan completed for "${business_name.trim()}" (status: ${result.status})`,
      metadata: {
        businessName:      business_name.trim(),
        status:            result.status,
        accuracyScore:     result.inaccuracy_report.accuracy_score,
        coverageScore:     result.omission_report.coverage_score,
        recommendationCount: result.recommendations.length,
      },
    });

    // ── Operational notifications (fire-and-forget) ───────────
    void (async () => {
      try {
        await NotificationService.scanCompleted(orgId, scanId, business_name.trim());

        const lastTwo = await db.perceptionScan.findMany({
          where: { organizationId: orgId, companyProfileId: profileId, status: { in: ["COMPLETE", "PARTIAL"] } },
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
            await NotificationService.visibilityImproved(orgId, scanId, business_name.trim(), delta);
          } else if (delta.significantDecline) {
            await NotificationService.visibilityDeclined(orgId, scanId, business_name.trim(), delta);
          }
        }

        const openCount = await RecommendationRepository.countOpenByOrg(orgId);
        if (openCount >= 5) {
          await NotificationService.recommendationBacklogGrowing(orgId, openCount);
        }
      } catch (notifErr) {
        console.error("[scan] Notification error (non-fatal):", notifErr);
      }
    })();

    // ── Return summary response ───────────────────────────────
    return NextResponse.json({
      scan_id: scanId,
      status: result.status,
      summary: {
        models_used: result.models_requested,
        successful_models: result.model_results.filter((r) => r.success).length,
        failed_models: result.model_results.filter((r) => !r.success).length,
        accuracy_score: result.inaccuracy_report.accuracy_score,
        coverage_score: result.omission_report.coverage_score,
        entity_understanding_score: result.entity_understanding.overall_score,
        consistency_score: result.consistency.consistency_score,
        consistency_label: result.consistency.consistency_label,
        total_recommendations: result.recommendations.length,
        high_priority_recommendations: result.recommendations.filter(
          (r) => r.priority === "high",
        ).length,
        perception_summary: result.comparison.perception_summary,
      },
    });
  } catch (err: any) {
    console.error("[scan] POST execution error", {
      traceId,
      scanId: scanId || null,
      error: err?.message,
    });

    // SCAN_FAILED — emit before returning error response
    void OperationalEventService.emit({
      eventType:      EVENT_TYPES.SCAN_FAILED,
      severity:       SEVERITIES.ERROR,
      source:         EVENT_SOURCES.SCAN_API,
      traceId,
      entityType:     scanId ? 'scan' : 'org',
      entityId:       scanId || undefined,
      message:        `Scan failed: ${err?.message ?? 'unknown error'}`,
      metadata: {
        error:  err?.message,
        scanId: scanId || null,
      },
    });

    return NextResponse.json(
      {
        error: err.message || "Scan execution failed",
        scan_id: scanId || undefined,
      },
      { status: 500 },
    );
  }
}
