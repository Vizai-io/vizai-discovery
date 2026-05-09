/**
 * @fileOverview Scan Schedule repository.
 * All Prisma queries for the scan_schedules table.
 */

import { db } from "@/lib/db";
import type { ScanSchedule, RecurrenceInterval } from "@prisma/client";

export type ScanScheduleWithProfile = ScanSchedule & {
  companyProfile: { businessName: string; websiteUrl: string | null };
};

export type CreateScanScheduleInput = {
  organizationId: string;
  companyProfileId: string;
  interval: RecurrenceInterval;
  nextRunAt?: Date;
  modelsToUse?: string[];
};

export const ScanScheduleRepository = {
  async create(data: CreateScanScheduleInput): Promise<ScanSchedule> {
    return db.scanSchedule.create({ data });
  },

  async findById(id: string, organizationId: string): Promise<ScanSchedule | null> {
    return db.scanSchedule.findFirst({ where: { id, organizationId } });
  },

  async findByOrg(organizationId: string): Promise<ScanSchedule[]> {
    return db.scanSchedule.findMany({
      where: { organizationId, isActive: true },
      orderBy: { nextRunAt: "asc" },
    });
  },

  async findByProfile(
    companyProfileId: string,
    organizationId: string,
  ): Promise<ScanSchedule[]> {
    return db.scanSchedule.findMany({
      where: { companyProfileId, organizationId },
    });
  },

  /**
   * Find all active schedules due to run — used by the schedule runner.
   */
  async findDue(): Promise<ScanSchedule[]> {
    return db.scanSchedule.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: new Date() },
      },
      orderBy: { nextRunAt: "asc" },
    });
  },

  async updateAfterRun(
    id: string,
    nextRunAt: Date,
  ): Promise<ScanSchedule> {
    return db.scanSchedule.update({
      where: { id },
      data: { lastRunAt: new Date(), nextRunAt },
    });
  },

  /**
   * Find all schedules for an org (active and inactive) with company profile name.
   * Used by the monitoring dashboard.
   */
  async findAllByOrgWithProfile(organizationId: string): Promise<ScanScheduleWithProfile[]> {
    return db.scanSchedule.findMany({
      where: { organizationId },
      include: {
        companyProfile: { select: { businessName: true, websiteUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async setActive(id: string, organizationId: string, isActive: boolean): Promise<ScanSchedule> {
    const existing = await db.scanSchedule.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error("Scan schedule not found or access denied");
    return db.scanSchedule.update({ where: { id }, data: { isActive } });
  },
};
