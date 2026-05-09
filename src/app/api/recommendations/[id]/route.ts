/**
 * @fileOverview PATCH /api/recommendations/[id]
 *
 * Updates the workflow status of a recommendation.
 * Only the authenticated org may update its own recommendations.
 *
 * Request body: { status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "DISMISSED" }
 *
 * Sets the appropriate timestamp field for the transition:
 *   IN_PROGRESS → inProgressAt
 *   COMPLETED   → completedAt (also sets isActioned / actionedAt for compat)
 *   DISMISSED   → dismissedAt
 *   OPEN        → clears active timestamp (status reset)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { RecommendationRepository } from "@/lib/repositories";
import { db } from "@/lib/db";
import type { RecommendationStatus } from "@prisma/client";

const VALID_STATUSES: RecommendationStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "DISMISSED"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the recommendation belongs to this org
    const existing = await db.recommendation.findUnique({
      where: { id },
      include: {
        perceptionScan: { select: { organizationId: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
    }
    if (existing.perceptionScan.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const body = await request.json();
    const status = body.status as RecommendationStatus;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const updated = await RecommendationRepository.updateStatus(id, status);

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      in_progress_at: updated.inProgressAt,
      completed_at: updated.completedAt,
      dismissed_at: updated.dismissedAt,
      opened_at: updated.openedAt,
    });
  } catch (err: any) {
    console.error("Error updating recommendation status:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update recommendation" },
      { status: 500 },
    );
  }
}
