/**
 * @fileOverview GET /api/recommendations
 *
 * Lists recommendations for the authenticated org.
 * Supports optional query filters: status, priority, scanId.
 *
 * Response shape:
 *   { recommendations: RecommendationItem[], total: number }
 *
 * Authentication required. All results are org-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { RecommendationRepository } from "@/lib/repositories";
import type { RecommendationStatus, Priority } from "@prisma/client";

const VALID_STATUSES: RecommendationStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "DISMISSED"];
const VALID_PRIORITIES: Priority[] = ["HIGH", "MEDIUM", "LOW"];

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ recommendations: [], total: 0 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status")?.toUpperCase() as RecommendationStatus | null;
    const priorityParam = searchParams.get("priority")?.toUpperCase() as Priority | null;
    const scanId = searchParams.get("scanId") ?? undefined;

    const status =
      statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined;
    const priority =
      priorityParam && VALID_PRIORITIES.includes(priorityParam) ? priorityParam : undefined;

    const recs = await RecommendationRepository.findByOrgWithScan(auth.organizationId, {
      status,
      priority,
      scanId,
    });

    const formatted = recs.map((r) => ({
      id: r.id,
      perception_scan_id: r.perceptionScanId,
      scan_created_at: r.perceptionScan?.createdAt ?? null,
      business_name: r.perceptionScan?.companyProfile.businessName ?? null,
      priority: r.priority,
      category: r.category,
      title: r.title,
      reason: r.reason,
      recommended_action: r.recommendedAction,
      service_link: r.serviceLink,
      status: r.status,
      opened_at: r.openedAt,
      in_progress_at: r.inProgressAt,
      completed_at: r.completedAt,
      dismissed_at: r.dismissedAt,
      created_at: r.createdAt,
    }));

    return NextResponse.json({ recommendations: formatted, total: formatted.length });
  } catch (err: any) {
    console.error("Error listing recommendations:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list recommendations" },
      { status: 500 },
    );
  }
}
