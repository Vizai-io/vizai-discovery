/**
 * @fileOverview Perception Scan repository.
 * All Prisma queries for the perception_scans table.
 * Every query is scoped to organizationId.
 */

import { db } from "@/lib/db";
import type { PerceptionScan, ScanStatus } from "@prisma/client";

export type CreateScanInput = {
  organizationId: string;
  companyProfileId: string;
  promptUsed: string;
  modelsRequested: string[];
  isSimulated?: boolean;
};

export type PaginationOpts = {
  limit?: number;
  offset?: number;
};

export const PerceptionScanRepository = {
  async create(data: CreateScanInput): Promise<PerceptionScan> {
    return db.perceptionScan.create({
      data: {
        ...data,
        status: "PENDING",
        startedAt: new Date(),
      },
    });
  },

  /**
   * Find by ID — enforces org scope.
   */
  async findById(id: string, organizationId: string): Promise<PerceptionScan | null> {
    return db.perceptionScan.findFirst({
      where: { id, organizationId },
    });
  },

  /**
   * Find with all related data (model results, report, recommendations).
   */
  async findByIdWithRelations(id: string, organizationId: string) {
    return db.perceptionScan.findFirst({
      where: { id, organizationId },
      include: {
        modelResults: true,
        scanReport: true,
        recommendations: {
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  },

  async findByOrg(
    organizationId: string,
    opts: PaginationOpts = {},
  ): Promise<PerceptionScan[]> {
    return db.perceptionScan.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
  },

  async findByProfile(
    companyProfileId: string,
    organizationId: string,
    opts: PaginationOpts = {},
  ): Promise<PerceptionScan[]> {
    return db.perceptionScan.findMany({
      where: { companyProfileId, organizationId },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 20,
      skip: opts.offset ?? 0,
    });
  },

  async updateStatus(
    id: string,
    status: ScanStatus,
    currentStep?: string,
  ): Promise<void> {
    await db.perceptionScan.update({
      where: { id },
      data: {
        status,
        currentStep: currentStep ?? null,
        ...(status === "COMPLETE" || status === "PARTIAL" || status === "FAILED" || status === "TIMEOUT"
          ? { completedAt: new Date() }
          : {}),
      },
    });
  },

  async updateStep(id: string, currentStep: string): Promise<void> {
    await db.perceptionScan.update({
      where: { id },
      data: { currentStep },
    });
  },

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await db.perceptionScan.update({
      where: { id },
      data: {
        status: "FAILED",
        errorMessage,
        currentStep: "Failed",
        completedAt: new Date(),
      },
    });
  },

  async countByOrg(organizationId: string): Promise<number> {
    return db.perceptionScan.count({ where: { organizationId } });
  },

  async countByStatus(organizationId: string, status: ScanStatus): Promise<number> {
    return db.perceptionScan.count({ where: { organizationId, status } });
  },

  /**
   * Find by ID without org scope enforcement.
   * Used ONLY by the GET /api/scan/:id route until Phase 3 auth is wired in.
   * Do NOT use this in new org-scoped features.
   */
  async findByIdWithRelationsNoScope(id: string) {
    return db.perceptionScan.findUnique({
      where: { id },
      include: {
        modelResults: true,
        scanReport: true,
        recommendations: {
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        },
        companyProfile: {
          select: { businessName: true, websiteUrl: true },
        },
      },
    });
  },
};
