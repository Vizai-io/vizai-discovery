/**
 * @fileOverview GET /api/perception-scans — List perception scans for the
 * authenticated user's organization.
 *
 * Query params:
 *   ?limit=20       (default 20, max 100)
 *   ?offset=0
 *   ?profileId=xxx  (filter by company profile)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(rawLimit, 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);
  const profileId = searchParams.get("profileId") ?? undefined;

  const scans = await db.perceptionScan.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(profileId ? { companyProfileId: profileId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: {
      companyProfile: { select: { businessName: true, websiteUrl: true } },
      scanReport: {
        select: {
          accuracyScore: true,
          coverageScore: true,
          entityUnderstandingScore: true,
          consistencyScore: true,
          consistencyLabel: true,
          perceptionSummary: true,
        },
      },
      recommendations: {
        where: { priority: "HIGH" },
        select: { id: true, title: true, category: true },
        take: 3,
      },
    },
  });

  const total = await db.perceptionScan.count({
    where: {
      organizationId: auth.organizationId,
      ...(profileId ? { companyProfileId: profileId } : {}),
    },
  });

  return NextResponse.json({
    scans: scans.map((s) => ({
      id: s.id,
      status: s.status,
      businessName: s.companyProfile?.businessName ?? "Unknown",
      websiteUrl: s.companyProfile?.websiteUrl ?? null,
      modelsRequested: s.modelsRequested,
      isSimulated: s.isSimulated,
      createdAt: s.createdAt,
      completedAt: s.completedAt,
      currentStep: s.currentStep,
      // Scores (null if scan hasn't completed)
      accuracyScore: s.scanReport?.accuracyScore ?? null,
      coverageScore: s.scanReport?.coverageScore ?? null,
      entityUnderstandingScore: s.scanReport?.entityUnderstandingScore ?? null,
      consistencyScore: s.scanReport?.consistencyScore ?? null,
      consistencyLabel: s.scanReport?.consistencyLabel ?? null,
      perceptionSummary: s.scanReport?.perceptionSummary ?? null,
      topRecommendations: s.recommendations,
    })),
    total,
    limit,
    offset,
  });
}
