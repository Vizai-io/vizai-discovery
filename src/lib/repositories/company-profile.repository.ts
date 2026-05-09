/**
 * @fileOverview Company Profile repository.
 * All Prisma queries for the company_profiles table.
 * Every query is scoped to organizationId — never returns cross-org data.
 */

import { db } from "@/lib/db";
import type { CompanyProfile } from "@prisma/client";

export type CreateCompanyProfileInput = {
  organizationId: string;
  businessName: string;
  websiteUrl?: string;
  officialDescription?: string;
  officialBusinessType?: string;
  officialServices?: string[];
  officialLocations?: string[];
  officialIndustries?: string[];
  officialDifferentiators?: string[];
  officialCustomerTypes?: string[];
};

export type UpdateCompanyProfileInput = Partial<Omit<CreateCompanyProfileInput, "organizationId">>;

export const CompanyProfileRepository = {
  async create(data: CreateCompanyProfileInput): Promise<CompanyProfile> {
    return db.companyProfile.create({ data });
  },

  /**
   * Find by ID — enforces org scope to prevent cross-tenant access.
   */
  async findById(id: string, organizationId: string): Promise<CompanyProfile | null> {
    return db.companyProfile.findFirst({
      where: { id, organizationId },
    });
  },

  async findByOrg(organizationId: string): Promise<CompanyProfile[]> {
    return db.companyProfile.findMany({
      where: { organizationId, isActive: true },
      orderBy: { businessName: "asc" },
    });
  },

  async findByName(businessName: string, organizationId: string): Promise<CompanyProfile | null> {
    return db.companyProfile.findFirst({
      where: {
        organizationId,
        businessName: { equals: businessName, mode: "insensitive" },
      },
    });
  },

  async update(
    id: string,
    organizationId: string,
    data: UpdateCompanyProfileInput,
  ): Promise<CompanyProfile> {
    // findFirst to verify org scope before updating
    const existing = await db.companyProfile.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error("Company profile not found or access denied");
    return db.companyProfile.update({ where: { id }, data });
  },

  async setActive(id: string, organizationId: string, isActive: boolean): Promise<CompanyProfile> {
    const existing = await db.companyProfile.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error("Company profile not found or access denied");
    return db.companyProfile.update({ where: { id }, data: { isActive } });
  },

  async countByOrg(organizationId: string): Promise<number> {
    return db.companyProfile.count({ where: { organizationId, isActive: true } });
  },
};
