/**
 * @fileOverview Recommendation repository.
 * All Prisma queries for the recommendations table.
 */

import { db } from "@/lib/db";
import type { Recommendation, Priority, RecommendationStatus } from "@prisma/client";
import type { PerceptionRecommendation } from "@/lib/types/perception-scan";

export const RecommendationRepository = {
  /**
   * Bulk-insert all recommendations for a scan.
   */
  async createMany(
    perceptionScanId: string,
    recommendations: PerceptionRecommendation[],
  ): Promise<void> {
    if (recommendations.length === 0) return;

    const priorityMap: Record<string, Priority> = {
      high: "HIGH",
      medium: "MEDIUM",
      low: "LOW",
    };

    await db.recommendation.createMany({
      data: recommendations.map((r) => ({
        perceptionScanId,
        priority: priorityMap[r.priority] ?? "LOW",
        category: r.category,
        title: r.title,
        reason: r.reason,
        recommendedAction: r.recommended_action,
        serviceLink: null, // future: r.service_link when added to PerceptionRecommendation type
      })),
    });
  },

  async findByScan(perceptionScanId: string): Promise<Recommendation[]> {
    return db.recommendation.findMany({
      where: { perceptionScanId },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
  },

  async findHighPriorityByScan(perceptionScanId: string): Promise<Recommendation[]> {
    return db.recommendation.findMany({
      where: { perceptionScanId, priority: "HIGH" },
      orderBy: { createdAt: "asc" },
    });
  },

  async markActioned(id: string): Promise<Recommendation> {
    return db.recommendation.update({
      where: { id },
      data: { isActioned: true, actionedAt: new Date() },
    });
  },

  async countByScan(perceptionScanId: string): Promise<number> {
    return db.recommendation.count({ where: { perceptionScanId } });
  },

  async countHighPriorityByScan(perceptionScanId: string): Promise<number> {
    return db.recommendation.count({
      where: { perceptionScanId, priority: "HIGH" },
    });
  },

  // ── Phase 1.7: Workflow methods ───────────────────────────────

  /**
   * Update the workflow status of a recommendation, setting the
   * appropriate timestamp for the new status.
   */
  async updateStatus(
    id: string,
    status: RecommendationStatus,
  ): Promise<Recommendation> {
    const now = new Date();
    const timestampField: Partial<Record<string, Date>> = {
      OPEN: undefined,
      IN_PROGRESS: undefined,
      COMPLETED: undefined,
      DISMISSED: undefined,
    };

    // Set the timestamp for the transition
    if (status === "IN_PROGRESS") timestampField.inProgressAt = now;
    if (status === "COMPLETED") {
      timestampField.completedAt = now;
      // also mark legacy isActioned for backwards compat
    }
    if (status === "DISMISSED") timestampField.dismissedAt = now;

    return db.recommendation.update({
      where: { id },
      data: {
        status,
        inProgressAt: status === "IN_PROGRESS" ? now : undefined,
        completedAt: status === "COMPLETED" ? now : undefined,
        dismissedAt: status === "DISMISSED" ? now : undefined,
        // Legacy field sync
        isActioned: status === "COMPLETED" ? true : undefined,
        actionedAt: status === "COMPLETED" ? now : undefined,
      },
    });
  },

  /**
   * List all OPEN recommendations for an org, joined via perceptionScan.
   * Limited to 100; sorted HIGH first, then createdAt asc.
   */
  async findOpenByOrg(organizationId: string): Promise<Recommendation[]> {
    return db.recommendation.findMany({
      where: {
        status: "OPEN",
        perceptionScan: { organizationId },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: 100,
    });
  },

  async countOpenByOrg(organizationId: string): Promise<number> {
    return db.recommendation.count({
      where: {
        status: "OPEN",
        perceptionScan: { organizationId },
      },
    });
  },

  /**
   * Find all recommendations for an org, enriched with the scan's createdAt
   * and companyProfile businessName for display purposes.
   */
  async findByOrgWithScan(
    organizationId: string,
    filters?: {
      status?: RecommendationStatus;
      priority?: Priority;
      scanId?: string;
    },
  ): Promise<
    (Recommendation & {
      perceptionScan: {
        id: string;
        createdAt: Date;
        companyProfile: { businessName: string };
      } | null;
    })[]
  > {
    return db.recommendation.findMany({
      where: {
        perceptionScan: {
          organizationId,
          ...(filters?.scanId ? { id: filters.scanId } : {}),
        },
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.priority ? { priority: filters.priority } : {}),
      },
      include: {
        perceptionScan: {
          select: {
            id: true,
            createdAt: true,
            companyProfile: { select: { businessName: true } },
          },
        },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
  },
};
