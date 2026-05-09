/**
 * @fileOverview Consultation Request repository.
 * All Prisma queries for the consultation_requests table.
 */

import { db } from "@/lib/db";
import type { ConsultationRequest } from "@prisma/client";

export type CreateConsultationRequestInput = {
  organizationId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  message: string;
  serviceInterest?: string;
};

export const ConsultationRequestRepository = {
  async create(data: CreateConsultationRequestInput): Promise<ConsultationRequest> {
    return db.consultationRequest.create({ data });
  },

  async findById(id: string, organizationId: string): Promise<ConsultationRequest | null> {
    return db.consultationRequest.findFirst({ where: { id, organizationId } });
  },

  async findByOrg(organizationId: string): Promise<ConsultationRequest[]> {
    return db.consultationRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findByStatus(
    organizationId: string,
    status: string,
  ): Promise<ConsultationRequest[]> {
    return db.consultationRequest.findMany({
      where: { organizationId, status },
      orderBy: { createdAt: "desc" },
    });
  },

  async updateStatus(
    id: string,
    organizationId: string,
    status: "pending" | "reviewed" | "closed",
  ): Promise<ConsultationRequest> {
    const existing = await db.consultationRequest.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error("Consultation request not found or access denied");
    return db.consultationRequest.update({ where: { id }, data: { status } });
  },

  async countPendingByOrg(organizationId: string): Promise<number> {
    return db.consultationRequest.count({ where: { organizationId, status: "pending" } });
  },
};
