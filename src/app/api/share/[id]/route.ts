/**
 * @fileOverview GET /api/share/[id] — Public share route.
 *
 * STATUS: MIGRATED (Sprint 3 Task 2) — Firestore eliminated.
 *
 * Returns full public scan data for the share page.
 * Only accessible for scans where organizationId = 'free-scan'.
 *
 * Access policy (stabilization scope):
 *   - Only free-scan org scans are publicly shareable
 *   - Authenticated org scans are private (require dashboard access)
 *   - No moderation gate (Firestore's shareEnabled/reviewStatus dropped)
 *   - No viewCount tracking (dropped — non-functional in stabilization)
 *
 * Refinement A: traceId on all logs.
 * Refinement 3: SHARE_ACCESS telemetry on every successful access —
 *   provides operational visibility into citation tracing, crawler hits,
 *   and public artifact discoverability.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from '@/lib/services/operational-event-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;

  const userAgent = req.headers.get('user-agent') ?? 'unknown';
  const referer   = req.headers.get('referer') ?? 'direct';

  try {
    const scan = await db.perceptionScan.findFirst({
      where: {
        id,
        organizationId: 'free-scan',
        status:         'COMPLETE',
      },
      select: {
        id:          true,
        createdAt:   true,
        companyProfile: {
          select: {
            businessName: true,
            websiteUrl:   true,
          },
        },
        scanReport: {
          select: {
            perceptionSummary:        true,
            accuracyScore:            true,
            coverageScore:            true,
            entityUnderstandingScore: true,
            consistencyScore:         true,
            jsonReport:               true,
          },
        },
        recommendations: {
          select: {
            id:               true,
            category:         true,
            priority:         true,
            title:            true,
            reason:           true,
            recommendedAction: true,
          },
          orderBy: { priority: 'asc' },
          take: 3,
        },
      },
    });

    if (!scan || !scan.scanReport) {
      return NextResponse.json(
        { error: 'Report not found.' },
        { status: 404 },
      );
    }

    // ── SHARE_PAGE_ACCESSED telemetry — replaces console.log (Sprint 5) ────────
    void OperationalEventService.emit({
      eventType:      EVENT_TYPES.SHARE_PAGE_ACCESSED,
      severity:       SEVERITIES.INFO,
      source:         EVENT_SOURCES.SHARE_API,
      traceId,
      organizationId: 'free-scan',
      entityType:     'scan',
      entityId:       id,
      message:        'Share page accessed for free scan result',
      metadata: {
        userAgent,
        referer,
      },
    });

    const report   = scan.scanReport;
    const jsonData = report.jsonReport as any;

    // Build response in a shape matching what the share page expects.
    // Maps Postgres columns → legacy field names for minimal JSX changes.
    const categoryScores = jsonData?.categoryScores ?? {
      presence:              report.entityUnderstandingScore,
      descriptionAccuracy:   report.accuracyScore,
      citationStrength:      report.consistencyScore,
      serviceCoverage:       report.coverageScore,
      competitorShareOfVoice: null,
    };

    const overallScore: number = jsonData?.overallScore
      ?? Math.round(
           (report.accuracyScore + report.coverageScore +
            report.entityUnderstandingScore + report.consistencyScore) / 4,
         );

    return NextResponse.json({
      id:               scan.id,
      createdAt:        scan.createdAt.toISOString(),
      businessName:     scan.companyProfile?.businessName ?? 'Verified Client',
      websiteUrl:       scan.companyProfile?.websiteUrl ?? null,
      overallScore,
      overview:         report.perceptionSummary,
      categoryScores,
      recommendations: scan.recommendations.map((rec) => ({
        id:              rec.id,
        category:        rec.category,
        priority:        rec.priority.toLowerCase(),   // "HIGH" → "high" for badge variant
        title:           rec.title,
        description:     rec.reason,                   // map reason → description for share page
        expectedImpact:  rec.recommendedAction,        // map recommendedAction → expectedImpact
      })),
      competitorComparison: jsonData?.competitorComparison ?? [],
    });

  } catch (err: any) {
    console.error('[share] Unexpected error', {
      traceId,
      scanId: id,
      error: err?.message,
    });
    return NextResponse.json(
      { error: 'Unable to load intelligence report.' },
      { status: 500 },
    );
  }
}
