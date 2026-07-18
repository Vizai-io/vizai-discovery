/**
 * @fileOverview POST /api/free-scan — Public free scan endpoint.
 *
 * Public lifecycle entry point:
 *   visitor
 *   → POST /api/free-scan (rate check → engine → Postgres persist)
 *   → /free-scan/results/[id] (teaser view, locked)
 *   → /auth/register (CTA → sign up)
 *   → /onboarding (org assignment)
 *   → /dashboard (authenticated lifecycle)
 *
 * No authentication required. Rate limiting uses durable Postgres counters.
 *
 * Persistence destination: POSTGRES ONLY.
 * organizationId = 'free-scan' (seeded in migration 20260508000009).
 * sourceType     = 'FREE_SCAN' (Refinement 1 — lineage tracking).
 *
 * Refinement A: traceId on all logs.
 * Refinement B: FREE_SCAN_PIPELINE_INCOMPLETE assertion after persist.
 * Refinement 5: PUBLIC_RUNTIME_FLOW_BROKEN assertion checks acquisition funnel
 *   continuity — emits if share route or onboarding CTA would be broken.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ScanEngine } from '@/lib/services/scan-engine';
import { validateFreeScanRequest } from '@/lib/actions/usage-actions';
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from '@/lib/services/operational-event-service';

// ── Input validation ──────────────────────────────────────────────────────────

const FreeScanSchema = z.object({
  companyName:      z.string().min(2).max(200),
  website:          z.string().url(),
  industry:         z.string().min(1).max(100),
  targetGeography:  z.string().min(1).max(200),
  email:            z.string().email(),
  honeypot:         z.string().optional().default(''),
});

type FreeScanInput = z.infer<typeof FreeScanSchema>;

// ── POST /api/free-scan ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', traceId }, { status: 400 });
  }

  const parsed = FreeScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten(), traceId },
      { status: 422 },
    );
  }

  const input: FreeScanInput = parsed.data;

  // ── Step 1: Rate limit check ──────────────────────────────────────────────
  const rateCheck = await validateFreeScanRequest(input.email, input.honeypot);
  if (!rateCheck.allowed) {
    console.log('[free-scan] Rate limit blocked', {
      traceId,
      reason: rateCheck.reason,
    });
    return NextResponse.json(
      { error: rateCheck.reason ?? 'Rate limit exceeded', traceId },
      { status: 429 },
    );
  }

  // ── Step 2: Create CompanyProfile for this free scan ────────────────────
  // Each free scan gets its own CompanyProfile row under the 'free-scan' sentinel org.
  let companyProfile: { id: string };
  try {
    companyProfile = await db.companyProfile.create({
      data: {
        organizationId: 'free-scan',
        businessName:   input.companyName,
        websiteUrl:     input.website,
        officialIndustries: [input.industry],
        officialLocations:  [input.targetGeography],
      },
      select: { id: true },
    });
  } catch (err: any) {
    console.error('[free-scan] Failed to create CompanyProfile', {
      traceId,
      error: err?.message,
      phase: 'company_profile_create',
    });
    return NextResponse.json(
      { error: 'Failed to initialize scan. Please try again.', traceId },
      { status: 500 },
    );
  }

  // ── Step 3: Create PerceptionScan record ─────────────────────────────────
  let scanId: string;
  try {
    const scan = await db.perceptionScan.create({
      data: {
        organizationId:   'free-scan',
        companyProfileId: companyProfile.id,
        status:           'RUNNING',
        promptUsed:       `Free scan for ${input.companyName}`,
        modelsRequested:  ['deterministic-mock'],
        isSimulated:      true,
        sourceType:       'FREE_SCAN',
        startedAt:        new Date(),
      },
      select: { id: true },
    });
    scanId = scan.id;
  } catch (err: any) {
    console.error('[free-scan] Failed to create PerceptionScan', {
      traceId,
      error: err?.message,
      phase: 'perception_scan_create',
    });
    return NextResponse.json(
      { error: 'Failed to initialize scan. Please try again.', traceId },
      { status: 500 },
    );
  }

  console.log('[free-scan] Scan created', {
    traceId,
    scanId,
    companyName: input.companyName,
    phase:       'created',
  });

  // FREE_SCAN_STARTED — public funnel entry point instrumented
  void OperationalEventService.emit({
    eventType:      EVENT_TYPES.FREE_SCAN_STARTED,
    severity:       SEVERITIES.INFO,
    source:         EVENT_SOURCES.FREE_SCAN_API,
    traceId,
    organizationId: 'free-scan',
    entityType:     'scan',
    entityId:       scanId,
    message:        `Free scan started for "${input.companyName}"`,
    metadata: {
      companyName:     input.companyName,
      industry:        input.industry,
      targetGeography: input.targetGeography,
    },
  });

  // ── Step 4: Run the deterministic scan engine ────────────────────────────
  let scanResults: Awaited<ReturnType<typeof ScanEngine.runFreeScan>>;
  try {
    scanResults = await ScanEngine.runFreeScan({
      companyName:     input.companyName,
      website:         input.website,
      industry:        input.industry,
      targetGeography: input.targetGeography,
    });
  } catch (err: any) {
    console.error('[free-scan] Scan engine failed', {
      traceId,
      scanId,
      error: err?.message,
      phase: 'engine_execution',
    });
    await db.perceptionScan.update({
      where: { id: scanId },
      data: { status: 'FAILED', errorMessage: err?.message ?? 'Engine error', completedAt: new Date() },
    });
    return NextResponse.json(
      { error: 'Scan failed. Please try again.', traceId },
      { status: 500 },
    );
  }

  // ── Step 5: Persist results ──────────────────────────────────────────────
  try {
    const { categoryScores, overallScore, overview, priorityActions } = scanResults;

    await Promise.all([
      // ScanReport — stores scores + full JSON output for share/results pages
      db.scanReport.create({
        data: {
          perceptionScanId:         scanId,
          perceptionSummary:        overview ?? '',
          accuracyScore:            Math.round(categoryScores.descriptionAccuracy),
          coverageScore:            Math.round(categoryScores.serviceCoverage),
          entityUnderstandingScore: Math.round(categoryScores.presence),
          consistencyScore:         Math.round(categoryScores.citationStrength),
          consistencyLabel:         'MODERATE_DIVERGENCE',
          jsonReport: {
            overallScore,
            categoryScores,
            competitorComparison:         scanResults.competitorComparison,
            benchmark:                    scanResults.benchmark,
            aiDescriptionAccuracy:        scanResults.aiDescriptionAccuracy,
            knowledgeGaps:                scanResults.knowledgeGaps,
            missedDiscoveryOpportunities: scanResults.missedDiscoveryOpportunities,
            queryDiscovery:               scanResults.queryDiscovery,
            companyName:                  input.companyName,
            industry:                     input.industry,
            targetGeography:              input.targetGeography,
            email:                        input.email,
            sourceType:                   'FREE_SCAN',
          } as any,
        },
      }),

      // Recommendations — from priorityActions
      db.recommendation.createMany({
        data: priorityActions.map((rec: any) => ({
          perceptionScanId: scanId,
          priority:         (rec.priority?.toUpperCase() ?? 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
          category:         (rec.category as string | undefined) ?? 'General',
          title:            (rec.title as string | undefined) ?? 'Recommendation',
          reason:           (rec.description as string | undefined) ?? '',
          recommendedAction: (rec.expectedImpact as string | undefined) ?? '',
          status:           'OPEN' as const,
        })),
      }),

      // Mark scan as COMPLETE
      db.perceptionScan.update({
        where: { id: scanId },
        data: {
          status:      'COMPLETE',
          completedAt: new Date(),
          currentStep: 'Complete',
        },
      }),
    ]);

    console.log('[free-scan] Scan persisted', {
      traceId,
      scanId,
      overallScore,
      recommendationCount: priorityActions.length,
      phase: 'persisted',
    });

    // FREE_SCAN_COMPLETED — full pipeline success
    void OperationalEventService.emit({
      eventType:      EVENT_TYPES.FREE_SCAN_COMPLETED,
      severity:       SEVERITIES.INFO,
      source:         EVENT_SOURCES.FREE_SCAN_API,
      traceId,
      organizationId: 'free-scan',
      entityType:     'scan',
      entityId:       scanId,
      message:        `Free scan completed for "${input.companyName}" (score: ${overallScore})`,
      metadata: {
        overallScore,
        recommendationCount: priorityActions.length,
      },
    });
  } catch (err: any) {
    console.error('[free-scan] Persistence failure', {
      traceId,
      scanId,
      error: err?.message,
      phase: 'persistence',
    });
    await db.perceptionScan.update({
      where: { id: scanId },
      data: { status: 'FAILED', errorMessage: 'Scan completed but failed to save results', completedAt: new Date() },
    });
    return NextResponse.json(
      { error: 'Scan completed but failed to save results. Please try again.', traceId },
      { status: 500 },
    );
  }

  // ── Step 6: Integrity assertions (Refinement B + Refinement 5) ──────────
  // Fire-and-forget — never throws, never affects the response.
  void (async () => {
    try {
      const [scanExists, reportCount, recommendationCount] = await Promise.all([
        db.perceptionScan.findUnique({ where: { id: scanId }, select: { status: true } }),
        db.scanReport.count({ where: { perceptionScanId: scanId } }),
        db.recommendation.count({ where: { perceptionScanId: scanId } }),
      ]);

      const missingStages: string[] = [];
      if (!scanExists) missingStages.push('perceptionScan');
      if (reportCount === 0) missingStages.push('scanReport');
      if (recommendationCount === 0) missingStages.push('recommendations');

      if (missingStages.length > 0) {
        // FREE_SCAN_PIPELINE_INCOMPLETE assertion
        void OperationalEventService.emit({
          eventType:      EVENT_TYPES.FREE_SCAN_PIPELINE_INCOMPLETE,
          severity:       SEVERITIES.ERROR,
          source:         EVENT_SOURCES.FREE_SCAN_API,
          traceId,
          organizationId: 'free-scan',
          entityType:     'scan',
          entityId:       scanId,
          message:        `Free scan pipeline incomplete — missing stages: ${missingStages.join(', ')}`,
          metadata: {
            missingStages,
            sourceType:             'FREE_SCAN',
            persistenceDestination: 'postgres',
          },
        });

        // PUBLIC_RUNTIME_FLOW_BROKEN assertion — acquisition funnel continuity broken
        void OperationalEventService.emit({
          eventType:      EVENT_TYPES.PUBLIC_RUNTIME_FLOW_BROKEN,
          severity:       SEVERITIES.CRITICAL,
          source:         EVENT_SOURCES.FREE_SCAN_API,
          traceId,
          entityType:     'scan',
          entityId:       scanId,
          message:        'Acquisition funnel broken: incomplete free scan → share page will 404 → onboarding CTA unreachable',
          metadata: {
            missingStage:     missingStages[0],
            lifecycleSegment: 'free-scan → share → onboarding',
            parentTraceId:    traceId,
          },
        });
      } else {
        console.log('[free-scan] Pipeline integrity OK', {
          traceId,
          scanId,
          reportCount,
          recommendationCount,
          phase: 'integrity_check',
        });
      }
    } catch (assertErr: any) {
      console.error('[free-scan] Integrity assertion failed to run', {
        traceId,
        scanId,
        error: assertErr?.message,
      });
    }
  })();

  return NextResponse.json({ scanId }, { status: 201 });
}
