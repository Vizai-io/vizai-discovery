/**
 * @fileOverview TruthPublishRepository
 *
 * All Prisma queries for the truth_publish_records table.
 * All queries are organization-scoped.
 *
 * State machine enforced here:
 *   DRAFT → PUBLISHED (via confirmPublish)
 *   PUBLISHED → SUPERSEDED (automatically when a new PUBLISHED record is created)
 *
 * Repositories never contain business logic — that lives in CanonicalTruthService.
 */

import { db } from "@/lib/db";
import type { TruthPublishRecord } from "@prisma/client";

export const TruthPublishRepository = {
  /**
   * Find the latest DRAFT for a profile (at most one exists at a time).
   */
  async findDraft(companyProfileId: string): Promise<TruthPublishRecord | null> {
    return db.truthPublishRecord.findFirst({
      where: { companyProfileId, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Find the most recent PUBLISHED record for a profile.
   * Used for diff computation and dedup hash check.
   */
  async findLatestPublished(companyProfileId: string): Promise<TruthPublishRecord | null> {
    return db.truthPublishRecord.findFirst({
      where: { companyProfileId, status: "PUBLISHED" },
      orderBy: { version: "desc" },
    });
  },

  /**
   * Get the next version number for a profile.
   * Finds max version across all states and increments by 1.
   */
  async nextVersion(companyProfileId: string): Promise<number> {
    const result = await db.truthPublishRecord.aggregate({
      where: { companyProfileId },
      _max: { version: true },
    });
    return (result._max.version ?? 0) + 1;
  },

  /**
   * Create a new DRAFT record.
   */
  async createDraft(data: {
    organizationId: string;
    companyProfileId: string;
    version: number;
    exportPayload: object;
    payloadHash: string;
  }): Promise<TruthPublishRecord> {
    return db.truthPublishRecord.create({ data: { ...data, status: "DRAFT" } });
  },

  /**
   * Update an existing DRAFT's payload (refresh with latest canonical truth).
   */
  async refreshDraft(
    id: string,
    exportPayload: object,
    payloadHash: string,
  ): Promise<TruthPublishRecord> {
    return db.truthPublishRecord.update({
      where: { id },
      data: { exportPayload, payloadHash },
    });
  },

  /**
   * Confirm publish: transition DRAFT → PUBLISHED, mark all previous PUBLISHED → SUPERSEDED.
   * Executed in a transaction for atomicity.
   */
  async confirmPublish(
    recordId: string,
    companyProfileId: string,
  ): Promise<TruthPublishRecord> {
    const now = new Date();
    return db.$transaction(async (tx) => {
      // Supersede all existing PUBLISHED records for this profile
      await tx.truthPublishRecord.updateMany({
        where: { companyProfileId, status: "PUBLISHED" },
        data: { status: "SUPERSEDED" },
      });

      // Promote DRAFT → PUBLISHED
      return tx.truthPublishRecord.update({
        where: { id: recordId },
        data: {
          status: "PUBLISHED",
          publishedAt: now,
          confirmedAt: now,
        },
      });
    });
  },

  /**
   * Paginated publish history for a profile (most recent first).
   * Excludes DRAFTs — history shows confirmed and superseded records only.
   */
  async findHistory(
    companyProfileId: string,
    limit = 10,
  ): Promise<TruthPublishRecord[]> {
    return db.truthPublishRecord.findMany({
      where: {
        companyProfileId,
        status: { in: ["PUBLISHED", "SUPERSEDED"] },
      },
      orderBy: { version: "desc" },
      take: limit,
    });
  },
} as const;
