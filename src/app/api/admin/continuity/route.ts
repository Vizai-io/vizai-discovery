/**
 * @fileOverview GET /api/admin/continuity — Workflow Intelligence Dashboard data.
 *
 * Admin-only. Aggregates Sprint 6 services for all real organizations and
 * returns structured 5-panel data for the /admin/continuity dashboard.
 *
 * Panels:
 *   1. Organizational Continuity  (WorkflowContinuity + OperationalContinuityScore)
 *   2. Organizational Drift       (OrganizationalDrift)
 *   3. Recommendation Effectiveness (RecommendationImpact)
 *   4. Onboarding Quality         (OnboardingQuality)
 *   5. Operational Playbooks      (OperationalPlaybook)
 *
 * Query params:
 *   window: 7 | 30 | 90  (default: 30)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/get-auth-context';
import { db } from '@/lib/db';

import { WorkflowContinuityService }        from '@/lib/services/workflow-continuity-service';
import { OrganizationalDriftService }        from '@/lib/services/organizational-drift-service';
import { OnboardingIntelligenceService }     from '@/lib/services/onboarding-intelligence-service';
import { RecommendationImpactService }       from '@/lib/services/recommendation-impact-service';
import { OperationalContinuityScoringService } from '@/lib/services/operational-continuity-scoring-service';
import { OperationalPlaybookService }        from '@/lib/services/operational-playbook-service';

// ── Sentinel org IDs (excluded from all analysis) ─────────────────────────────

const SENTINEL_IDS = ['free-scan', 'unassigned'];

// ── GET /api/admin/continuity ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ── Window param (default 30) ──────────────────────────────────────────────
    const rawWindow = req.nextUrl.searchParams.get('window');
    const windowDays: 7 | 30 | 90 =
      rawWindow === '7'  ? 7  :
      rawWindow === '90' ? 90 :
      30;

    // ── 1. Load all real organizations ────────────────────────────────────────
    const orgs = await db.organization.findMany({
      where: {
        id:       { notIn: SENTINEL_IDS },
        isActive: true,
      },
      select: {
        id:        true,
        name:      true,
        slug:      true,
        tier:      true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const orgIds = orgs.map((o) => o.id);

    if (orgIds.length === 0) {
      return NextResponse.json({
        traceId,
        windowDays,
        generatedAt: new Date().toISOString(),
        summary: {
          totalOrgs: 0,
          byMaturityState: {},
          byDriftState:    {},
          byUrgency:       {},
          byOnboardingState: {},
          impactSummary:   { positive: 0, neutral: 0, negative: 0, insufficient: 0 },
        },
        scores:     [],
        continuity: [],
        drifts:     [],
        impacts:    [],
        onboardings:[],
        playbooks:  [],
      });
    }

    // ── 2. Run data services in parallel ──────────────────────────────────────
    const [continuities, drifts, onboardings, impacts] = await Promise.all([
      WorkflowContinuityService.computeForOrgs(orgIds, orgs, windowDays),
      OrganizationalDriftService.detectForOrgs(orgIds, orgs, windowDays),
      OnboardingIntelligenceService.analyzeForOrgs(orgIds, orgs, windowDays),
      RecommendationImpactService.computeForOrgs(orgIds, windowDays),
    ]);

    // ── 3. Build lookup Maps ──────────────────────────────────────────────────
    const continuityMap  = new Map(continuities.map((c) => [c.organizationId, c]));
    const driftMap       = new Map(drifts.map((d) => [d.organizationId, d]));
    const onboardingMap  = new Map(onboardings.map((o) => [o.organizationId, o]));
    const impactsByOrg   = new Map<string, typeof impacts>();
    for (const impact of impacts) {
      const existing = impactsByOrg.get(impact.organizationId) ?? [];
      existing.push(impact);
      impactsByOrg.set(impact.organizationId, existing);
    }

    // ── 4. Composite scoring (pure — in-memory) ───────────────────────────────
    const scores = OperationalContinuityScoringService.computeForOrgs(
      orgIds, continuityMap, driftMap, onboardingMap,
    );
    const scoreMap = new Map(scores.map((s) => [s.organizationId, s]));

    // ── 5. Playbook generation (pure — in-memory) ─────────────────────────────
    const playbooks = OperationalPlaybookService.computeForOrgs(
      orgIds, continuityMap, driftMap, onboardingMap, scoreMap, impactsByOrg, windowDays,
    );

    // ── 6. Summary aggregations ───────────────────────────────────────────────
    const byMaturityState: Record<string, number> = {};
    const byDriftState:    Record<string, number> = {};
    const byUrgency:       Record<string, number> = {};
    const byOnboardingState: Record<string, number> = {};
    const impactSummary = { positive: 0, neutral: 0, negative: 0, insufficient: 0 };

    for (const s of scores) {
      byMaturityState[s.maturityState] = (byMaturityState[s.maturityState] ?? 0) + 1;
    }
    for (const d of drifts) {
      byDriftState[d.driftState] = (byDriftState[d.driftState] ?? 0) + 1;
    }
    for (const p of playbooks) {
      byUrgency[p.urgency] = (byUrgency[p.urgency] ?? 0) + 1;
    }
    for (const o of onboardings) {
      byOnboardingState[o.onboardingState] = (byOnboardingState[o.onboardingState] ?? 0) + 1;
    }
    for (const i of impacts) {
      if      (i.impactState === 'POSITIVE')          impactSummary.positive++;
      else if (i.impactState === 'NEGATIVE')          impactSummary.negative++;
      else if (i.impactState === 'NEUTRAL')           impactSummary.neutral++;
      else if (i.impactState === 'INSUFFICIENT_DATA') impactSummary.insufficient++;
    }

    // ── 7. Build org name lookup for response ─────────────────────────────────
    const orgNameMap = new Map(orgs.map((o) => [o.id, { name: o.name, slug: o.slug, tier: o.tier }]));

    // ── Attach org names to top-level arrays ──────────────────────────────────
    function withOrgMeta<T extends { organizationId: string }>(arr: T[]) {
      return arr.map((item) => ({
        ...item,
        org: orgNameMap.get(item.organizationId) ?? null,
      }));
    }

    return NextResponse.json({
      traceId,
      windowDays,
      generatedAt: new Date().toISOString(),
      summary: {
        totalOrgs: orgIds.length,
        byMaturityState,
        byDriftState,
        byUrgency,
        byOnboardingState,
        impactSummary,
      },
      scores:     withOrgMeta(scores),
      continuity: withOrgMeta(continuities),
      drifts:     withOrgMeta(drifts),
      impacts:    withOrgMeta(impacts),
      onboardings:withOrgMeta(onboardings),
      playbooks:  withOrgMeta(playbooks),
    });

  } catch (err: any) {
    console.error('[admin/continuity] GET failed', { traceId, error: err?.message });
    return NextResponse.json(
      { error: 'Failed to load continuity data' },
      { status: 500 },
    );
  }
}
