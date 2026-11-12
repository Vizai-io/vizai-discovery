/**
 * @fileOverview Lead repository.
 * All Prisma queries for the leads table.
 */

import { db } from "@/lib/db";
import type { Lead, LeadStatus, LeadDraftStatus } from "@prisma/client";

export type CreateLeadInput = {
  organizationId: string;
  perceptionScanId?: string | null;
  businessName: string;
  websiteUrl?: string | null;
  industry?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  source?: string;
  scanSnapshot?: unknown;
};

export type UpdateLeadInput = {
  status?: LeadStatus;
  draftSubject?: string | null;
  draftBody?: string | null;
  draftStatus?: LeadDraftStatus;
  draftedAt?: Date | null;
  companyProfileId?: string | null;
  confirmedAt?: Date | null;
  confirmedBy?: string | null;
  intakeChecklist?: unknown;
};

export const LeadRepository = {
  /**
   * Create a lead. Caller should check findByScan first to avoid a
   * duplicate lead for the same scan.
   */
  async create(data: CreateLeadInput): Promise<Lead> {
    return db.lead.create({
      data: {
        organizationId: data.organizationId,
        perceptionScanId: data.perceptionScanId ?? null,
        businessName: data.businessName,
        websiteUrl: data.websiteUrl ?? null,
        industry: data.industry ?? null,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail ?? null,
        source: data.source ?? "FREE_SCAN",
        scanSnapshot: (data.scanSnapshot ?? undefined) as never,
      },
    });
  },

  async findById(id: string, organizationId: string): Promise<Lead | null> {
    return db.lead.findFirst({ where: { id, organizationId } });
  },

  async findByScan(
    perceptionScanId: string,
    organizationId: string,
  ): Promise<Lead | null> {
    return db.lead.findFirst({ where: { perceptionScanId, organizationId } });
  },

  async findByOrg(
    organizationId: string,
    opts?: { status?: LeadStatus },
  ): Promise<Lead[]> {
    return db.lead.findMany({
      where: {
        organizationId,
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findNewestByOrg(
    organizationId: string,
    opts?: { status?: LeadStatus },
  ): Promise<Lead | null> {
    return db.lead.findFirst({
      where: {
        organizationId,
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Update a lead (status and/or reply draft). Verifies org scope.
   */
  async update(
    id: string,
    organizationId: string,
    data: UpdateLeadInput,
  ): Promise<Lead> {
    const existing = await db.lead.findFirst({ where: { id, organizationId } });
    if (!existing) {
      throw new Error("Lead not found or access denied");
    }
    return db.lead.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.draftSubject !== undefined ? { draftSubject: data.draftSubject } : {}),
        ...(data.draftBody !== undefined ? { draftBody: data.draftBody } : {}),
        ...(data.draftStatus !== undefined ? { draftStatus: data.draftStatus } : {}),
        ...(data.draftedAt !== undefined ? { draftedAt: data.draftedAt } : {}),
        ...(data.companyProfileId !== undefined ? { companyProfileId: data.companyProfileId } : {}),
        ...(data.confirmedAt !== undefined ? { confirmedAt: data.confirmedAt } : {}),
        ...(data.confirmedBy !== undefined ? { confirmedBy: data.confirmedBy } : {}),
        ...(data.intakeChecklist !== undefined ? { intakeChecklist: data.intakeChecklist as never } : {}),
      },
    });
  },
};
