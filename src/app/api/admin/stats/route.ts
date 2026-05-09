/**
 * @fileOverview GET /api/admin/stats — Aggregated admin dashboard stats.
 * Admin only.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/get-auth-context";
import {
  OrganizationRepository,
  PerceptionScanRepository,
  ConsultationRequestRepository,
  UserRepository,
} from "@/lib/repositories";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [orgCount, userCount, pendingLeads, recentScans, organizations] =
    await Promise.all([
      OrganizationRepository.count(),
      db.user.count({ where: { isActive: true } }),
      ConsultationRequestRepository.countPendingByOrg("unassigned").catch(() => 0),
      // Recent perception scans across all orgs (admin view)
      db.perceptionScan.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          companyProfile: { select: { businessName: true } },
          scanReport: {
            select: { accuracyScore: true, coverageScore: true },
          },
        },
      }),
      // All orgs with profile counts
      db.organization.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { companyProfiles: true } },
        },
      }),
    ]);

  const totalScans = await db.perceptionScan.count();

  return NextResponse.json({
    stats: {
      orgCount,
      userCount,
      totalScans,
      pendingLeads,
    },
    recentScans: recentScans.map((s) => ({
      id: s.id,
      businessName: s.companyProfile?.businessName ?? "Unknown",
      status: s.status,
      createdAt: s.createdAt,
      completedAt: s.completedAt,
      accuracyScore: s.scanReport?.accuracyScore ?? null,
      coverageScore: s.scanReport?.coverageScore ?? null,
      organizationId: s.organizationId,
    })),
    organizations: organizations.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      tier: o.tier,
      profileCount: o._count.companyProfiles,
      createdAt: o.createdAt,
    })),
  });
}
