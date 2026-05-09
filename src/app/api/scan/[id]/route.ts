/**
 * @fileOverview GET /api/scan/:id — Retrieve a perception scan result.
 *
 * Reads from Postgres only.
 *
 * Query params:
 *   ?format=markdown  → returns the Markdown report as text/markdown
 *   ?format=json      → returns the clean JSON report (default)
 *   ?format=full      → returns the complete raw scan document
 */

import { NextRequest, NextResponse } from "next/server";
import { PerceptionScanRepository } from "@/lib/repositories";
import { getAuthContext } from "@/lib/auth/get-auth-context";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ── Auth gate ─────────────────────────────────────────────
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing scan ID" }, { status: 400 });
    }

    const format = request.nextUrl.searchParams.get("format") || "json";

    // ── Read from Postgres ────────────────────────────────────
    const pgScan = await PerceptionScanRepository.findByIdWithRelationsNoScope(id);

    if (!pgScan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // ── Org scope enforcement ─────────────────────────────────
    // Admins may access scans across all orgs (review / approval workflows).
    // All other roles are restricted to their own organization.
    // Return 404 rather than 403 — prevents scan ID enumeration.
    if (auth.role !== "ADMIN" && pgScan.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    return buildPostgresResponse(pgScan, format);
  } catch (err: any) {
    console.error("Error fetching scan:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch scan" },
      { status: 500 },
    );
  }
}

// ── Response builders ─────────────────────────────────────────

function buildPostgresResponse(
  scan: NonNullable<
    Awaited<ReturnType<typeof PerceptionScanRepository.findByIdWithRelationsNoScope>>
  >,
  format: string,
): NextResponse {
  const report = scan.scanReport;

  switch (format) {
    case "markdown":
      return new NextResponse(report?.markdownReport ?? "# No report available", {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });

    case "full":
      return NextResponse.json({
        scan_id: scan.id,
        status: scan.status,
        business_name: scan.companyProfile?.businessName,
        website_url: scan.companyProfile?.websiteUrl,
        organization_id: scan.organizationId,
        company_profile_id: scan.companyProfileId,
        models_requested: scan.modelsRequested,
        prompt_used: scan.promptUsed,
        current_step: scan.currentStep,
        error_message: scan.errorMessage,
        is_simulated: scan.isSimulated,
        created_at: scan.createdAt,
        completed_at: scan.completedAt,
        model_results: scan.modelResults,
        scan_report: report,
        recommendations: scan.recommendations,
      });

    case "json":
    default:
      return NextResponse.json({
        scan_id: scan.id,
        status: scan.status,
        business_name: scan.companyProfile?.businessName,
        website_url: scan.companyProfile?.websiteUrl,
        created_at: scan.createdAt,
        completed_at: scan.completedAt,
        error_message: scan.errorMessage ?? null,
        // Scores
        accuracy_score: report?.accuracyScore ?? null,
        coverage_score: report?.coverageScore ?? null,
        entity_understanding_score: report?.entityUnderstandingScore ?? null,
        consistency_score: report?.consistencyScore ?? null,
        consistency_label: report?.consistencyLabel ?? null,
        // Summary
        perception_summary: report?.perceptionSummary ?? null,
        // Detail
        comparison: report
          ? {
              agreements: report.agreements,
              differences: report.differences,
              conflicts: report.conflicts,
            }
          : null,
        inaccuracy_report: report?.inaccuracyDetail ?? null,
        omission_report: report?.omissionDetail ?? null,
        entity_understanding: report?.entityUnderstanding ?? null,
        consistency_notes: report?.consistencyNotes ?? [],
        recommendations: scan.recommendations.map((r) => ({
          id: r.id,
          priority: r.priority,
          category: r.category,
          title: r.title,
          reason: r.reason,
          recommended_action: r.recommendedAction,
          service_link: r.serviceLink,
          is_actioned: r.isActioned,
        })),
        model_summaries: scan.modelResults
          .filter((r) => r.success)
          .map((r) => ({
            model_id: r.modelId,
            provider: r.provider,
            summary: r.summary,
            business_type: r.businessType,
            services: r.servicesMentioned,
            industries: r.industriesMentioned,
            locations: r.locationsMentioned,
            customers: r.customerTypesMentioned,
            differentiators: r.differentiatorsMentioned,
            latency_ms: r.latencyMs,
          })),
      });
  }
}

