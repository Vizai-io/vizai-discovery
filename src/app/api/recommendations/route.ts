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
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { hasRegistryScope } from "@/lib/auth/registry-scope";
import { db } from "@/lib/db";
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
      source: r.source,
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

const CreateRecommendationSchema = z.object({
  perceptionScanId: z.string().min(1),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  category: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  reason: z.string().min(1),
  recommendedAction: z.string().min(1),
  serviceLink: z.string().url().optional().nullable(),
  source: z.string().max(50).optional(),
});

/**
 * POST /api/recommendations
 *
 * Create a recommendation for a scan. Used by the Recommendation Agent
 * (NeuroOS hub) to persist the prioritized fix plan it generates from a
 * scan's gaps. Service keys need the registry:run scope; human ADMINs may
 * also create recommendations. The scan must belong to the caller's org.
 * Created recommendations start in OPEN status for human review.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (!hasRegistryScope(auth, "registry:run")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = CreateRecommendationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid recommendation", details: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const input = parsed.data;

    // The scan must belong to the caller's org (prevents cross-org writes).
    const scan = await db.perceptionScan.findFirst({
      where: { id: input.perceptionScanId, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const rec = await RecommendationRepository.create({
      perceptionScanId: input.perceptionScanId,
      organizationId: auth.organizationId,
      priority: input.priority,
      category: input.category,
      title: input.title,
      reason: input.reason,
      recommendedAction: input.recommendedAction,
      serviceLink: input.serviceLink ?? null,
      source: input.source ?? "INTELLIGENCE",
    });

    return NextResponse.json(
      {
        id: rec.id,
        perception_scan_id: rec.perceptionScanId,
        priority: rec.priority,
        category: rec.category,
        title: rec.title,
        reason: rec.reason,
        recommended_action: rec.recommendedAction,
        service_link: rec.serviceLink,
        source: rec.source,
        status: rec.status,
        created_at: rec.createdAt,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Error creating recommendation:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create recommendation" },
      { status: 500 },
    );
  }
}
