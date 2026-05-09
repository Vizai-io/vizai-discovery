/**
 * @fileOverview Competitor Profile repository.
 * All Prisma queries for the competitor_profiles table.
 */

import { db } from "@/lib/db";
import type { CompetitorProfile } from "@prisma/client";

export type CreateCompetitorProfileInput = {
  organizationId: string;
  companyProfileId?: string;
  businessName: string;
  websiteUrl?: string;
  notes?: string;
};

export const CompetitorProfileRepository = {
  async create(data: CreateCompetitorProfileInput): Promise<CompetitorProfile> {
    return db.competitorProfile.create({ data });
  },

  async findById(id: string, organizationId: string): Promise<CompetitorProfile | null> {
    return db.competitorProfile.findFirst({ where: { id, organizationId } });
  },

  async findByOrg(organizationId: string): Promise<CompetitorProfile[]> {
    return db.competitorProfile.findMany({
      where: { organizationId },
      orderBy: { businessName: "asc" },
    });
  },

  async findByProfile(
    companyProfileId: string,
    organizationId: string,
  ): Promise<CompetitorProfile[]> {
    return db.competitorProfile.findMany({
      where: { companyProfileId, organizationId },
      orderBy: { businessName: "asc" },
    });
  },

  async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<CreateCompetitorProfileInput, "organizationId">>,
  ): Promise<CompetitorProfile> {
    const existing = await db.competitorProfile.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error("Competitor profile not found or access denied");
    return db.competitorProfile.update({ where: { id }, data });
  },

  async delete(id: string, organizationId: string): Promise<void> {
    const existing = await db.competitorProfile.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error("Competitor profile not found or access denied");
    await db.competitorProfile.delete({ where: { id } });
  },
};
