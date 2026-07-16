/**
 * @fileOverview GET /api/free-scan/[id] — Public free scan result fetch.
 *
 * Returns the teaser-level scan data for the free-scan results page.
 * Only accessible for scans where organizationId = 'free-scan'.
 *
 * Response is intentionally minimal — the results page shows a locked overlay
 * with only overallScore + businessName visible. Full data is in GET /api/share/[id].
 *
 * No authentication required.
 *
 * Refinement A: traceId on all logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;

  try {
    const scan = await db.perceptionScan.findFirst({
      where: {
        id,
        organizationId: 'free-scan',
      },
      select: {
        id:          true,
        status:      true,
        completedAt: true,
        companyProfile: {
          select: { businessName: true },
        },
        scanReport: {
          select: { jsonReport: true },
        },
      },
    });

    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 },
      );
    }

    if (scan.status === 'RUNNING' || scan.status === 'PENDING') {
      return NextResponse.json({
        scanId:       scan.id,
        status:       scan.status,
        businessName: scan.companyProfile?.businessName ?? null,
        overallScore: null,
      });
    }

    if (scan.status === 'FAILED') {
      return NextResponse.json(
        { error: 'Scan failed to complete. Please run a new scan.' },
        { status: 422 },
      );
    }

    const jsonReport = scan.scanReport?.jsonReport as any;
    // Platform mock scans store overallScore at the top level; lmo-backend
    // intake scans store it under scores.overall.
    const overallScore: number = jsonReport?.overallScore ?? jsonReport?.scores?.overall ?? null;

    console.log('[free-scan/get] Result fetched', {
      traceId,
      scanId:      scan.id,
      status:      scan.status,
      overallScore,
    });

    return NextResponse.json({
      scanId:       scan.id,
      status:       scan.status,
      businessName: scan.companyProfile?.businessName ?? null,
      overallScore,
    });

  } catch (err: any) {
    console.error('[free-scan/get] Unexpected error', {
      traceId,
      scanId: id,
      error: err?.message,
    });
    return NextResponse.json(
      { error: 'Failed to load scan results' },
      { status: 500 },
    );
  }
}
