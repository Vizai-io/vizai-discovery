/**
 * @fileOverview Organization repository.
 * All Prisma queries for the organizations table.
 * No business logic — data access only.
 */

import { db } from "@/lib/db";
import type { Organization, OrgTier } from "@prisma/client";

export type UpdateBillingInput = {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: Date | null;
  tier?: OrgTier;
};

export type CreateOrganizationInput = {
  name: string;
  slug: string;
  tier?: OrgTier;
  adminEmail?: string;
  logoUrl?: string;
  website?: string;
};

export type UpdateOrganizationInput = Partial<Omit<CreateOrganizationInput, "slug">>;

export const OrganizationRepository = {
  async create(data: CreateOrganizationInput): Promise<Organization> {
    return db.organization.create({ data });
  },

  async findById(id: string): Promise<Organization | null> {
    return db.organization.findUnique({ where: { id } });
  },

  async findBySlug(slug: string): Promise<Organization | null> {
    return db.organization.findUnique({ where: { slug } });
  },

  async findAll(): Promise<Organization[]> {
    return db.organization.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async update(id: string, data: UpdateOrganizationInput): Promise<Organization> {
    return db.organization.update({ where: { id }, data });
  },

  async setActive(id: string, isActive: boolean): Promise<Organization> {
    return db.organization.update({ where: { id }, data: { isActive } });
  },

  async count(): Promise<number> {
    return db.organization.count({ where: { isActive: true } });
  },

  /**
   * Update billing-related fields only.
   * Called by webhook handler and checkout completion.
   */
  async updateBilling(id: string, data: UpdateBillingInput): Promise<Organization> {
    return db.organization.update({ where: { id }, data });
  },

  /**
   * Look up an org by its Stripe customer ID.
   * Used by webhook events that carry customerId but not organizationId.
   */
  async findByStripeCustomerId(stripeCustomerId: string): Promise<Organization | null> {
    return db.organization.findUnique({ where: { stripeCustomerId } });
  },
};
