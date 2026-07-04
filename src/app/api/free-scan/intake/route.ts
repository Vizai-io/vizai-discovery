/**
 * @fileOverview POST /api/free-scan/intake — Service intake for website free scans.
 *
 * WP-22 (decision D1 — single lead store): lmo-backend (FastAPI on Render) runs
 * the real Perplexity website scan, then forwards the lead + public result
 * snapshot here. Vizai-discovery Postgres is the single source of truth for
 * leads and scan history; the website funnel and the platform share one memory.
 *
 * Auth: service API key (Authorization: Bearer VIZAI_SERVICE_API_KEY) via
 * getAuthContext() — the same mechanism the NeuroOS agents / MCP server use.
 * A browser ADMIN session is also accepted (manual replay/backfill).
 *
 * Persistence (mirrors /api/free-scan):
 *   CompanyProfile + PerceptionScan + ScanReport under the 'free-scan' sentinel
 *   org, sourceType FREE_SCAN. isSimulated=false — a REAL engine ran upstream,
 *   unlike the deterministic-mock /api/free-scan path.
 *
 * Idempotency: the lmo-backend scan UUID is embedded in promptUsed
 *   ("lmo-backend:<uuid>"); duplicate deliveries return the existing scanId (200).
 *
 * Score mapping (backend → ScanReport columns; jsonReport carries the
 * untranslated original):
 *   accuracy  → accuracyScore
 *   discovery → coverageScore
 *   authority → entityUnderstandingScore
 *   overall   → consistencyScore
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/auth/get-auth-context';
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from '@/lib/services/operational-event-service';

// ── Input validation ──────────────────────────────────────────────────────────

const IntakeSchema = z.object({
  externalScanId:        z.string().min(8).max(64),
  source:                z.literal('lmo-backend'),
  businessName:          z.string().min(2).max(200),
  website:               z.string().url(),
  industry:              z.string().max(100).nullish(),
  email:                 z.string().email(),
  requestContact:        z.boolean().optional().default(false),
  createdAt:             z.string().datetime({ offset: true }).optional(),
  modelsUsed:            z.array(z.string().max(100)).max(5).optional().default([]),
  scores: z.object({
    discovery: z.number().int().min(0).max(100),
    accuracy:  z.number().int().min(0).max(100),
    authority: z.number().int().min(0).max(100),
    overall:   z.number().int().min(0).max(100),
  }),
  packageRecommendation: z.string().max(200).optional().default(''),
  strategySummary:       z.string().max(5000).optional().default(''),
  findings:              z.array(z.string().max(2000)).max(50).optional().default([]),
  publicSummary:         z.record(z.string(), z.unknown()).optional().default({}),
});

type IntakeInput = z.infer<typeof IntakeSchema>;

// ── POST /api/free-scan/intake ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  // ── Auth: service key (or ADMIN session) only — this is not a public route ──
  const auth = await getAuthContext();
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', traceId }, { status: 400 });
  }

  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten(), traceId },
      { status: 422 },
    );
  }

  const input: IntakeInput = parsed.data;
  const promptMarker = `lmo-backend:${input.externalScanId}`;

  // ── Idempotency: duplicate deliveries return the existing scan ─────────────
  try {
    const existing = await db.perceptionScan.findFirst({
      where: { organizationId: 'free-scan', promptUsed: promptMarker },
      select: { id: true },
    });
    if (existing) {
      console.log('[free-scan/intake] Duplicate delivery ignored', {
        traceId,
        scanId: existing.id,
        externalScanId: input.externalScanId,
      });
      return NextResponse.json({ scanId: existing.id, duplicate: true, traceId }, { status: 200 });
    }
  } catch (err: any) {
    console.error('[free-scan/intake] Duplicate check failed', {
      traceId,
      error: err?.message,
      phase: 'duplicate_check',
    });
    return NextResponse.json({ error: 'Intake failed. Please retry.', traceId }, { status: 500 });
  }

  // ── Persist lead + scan + report atomically ─────────────────────────────────
  const startedAt = input.createdAt ? new Date(input.createdAt) : new Date();
  let scanId: string;
  try {
    scanId = await db.$transaction(async (tx) => {
      const companyProfile = await tx.companyProfile.create({
        data: {
          organizationId:     'free-scan',
          businessName:       input.businessName,
          websiteUrl:         input.website,
          officialIndustries: input.industry ? [input.industry] : [],
        },
        select: { id: true },
      });

      const scan = await tx.perceptionScan.create({
        data: {
          organizationId:   'free-scan',
          companyProfileId: companyProfile.id,
          status:           'COMPLETE',
          promptUsed:       promptMarker,
          modelsRequested:  input.modelsUsed.length > 0 ? input.modelsUsed : ['lmo-backend'],
          isSimulated:      false,
          sourceType:       'FREE_SCAN',
          startedAt,
          completedAt:      new Date(),
        },
        select: { id: true },
      });

      await tx.scanReport.create({
        data: {
          perceptionScanId:         scan.id,
          perceptionSummary:        input.strategySummary,
          accuracyScore:            input.scores.accuracy,
          coverageScore:            input.scores.discovery,
          entityUnderstandingScore: input.scores.authority,
          consistencyScore:         input.scores.overall,
          consistencyLabel:         'MODERATE_DIVERGENCE',
          jsonReport: {
            intakeSource:          'lmo-backend',
            externalScanId:        input.externalScanId,
            companyName:           input.businessName,
            website:               input.website,
            industry:              input.industry ?? null,
            email:                 input.email,
            requestContact:        input.requestContact,
            scores:                input.scores,
            packageRecommendation: input.packageRecommendation,
            strategySummary:       input.strategySummary,
            findings:              input.findings,
            publicSummary:         input.publicSummary,
            sourceType:            'FREE_SCAN',
          } as any,
        },
      });

      return scan.id;
    });
  } catch (err: any) {
    console.error('[free-scan/intake] Persistence failure', {
      traceId,
      externalScanId: input.externalScanId,
      error: err?.message,
      phase: 'persistence',
    });
    return NextResponse.json({ error: 'Intake failed. Please retry.', traceId }, { status: 500 });
  }

  console.log('[free-scan/intake] Website scan ingested', {
    traceId,
    scanId,
    externalScanId: input.externalScanId,
    companyName:    input.businessName,
    overallScore:   input.scores.overall,
    phase:          'persisted',
  });

  void OperationalEventService.emit({
    eventType:      EVENT_TYPES.FREE_SCAN_COMPLETED,
    severity:       SEVERITIES.INFO,
    source:         EVENT_SOURCES.FREE_SCAN_API,
    traceId,
    organizationId: 'free-scan',
    entityType:     'scan',
    entityId:       scanId,
    message:        `Website free scan ingested for "${input.businessName}" (lmo-backend, score: ${input.scores.overall})`,
    metadata: {
      intakeSource:   'lmo-backend',
      externalScanId: input.externalScanId,
      overallScore:   input.scores.overall,
      requestContact: input.requestContact,
    },
  });

  return NextResponse.json({ scanId, traceId }, { status: 201 });
}
