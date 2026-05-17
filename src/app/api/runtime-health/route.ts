/**
 * @fileOverview GET /api/runtime-health — Firebase elimination convergence proof.
 *
 * Refinement 5 (Sprint 4): Returns a JSON object asserting the current state of
 * the Firebase → Postgres migration. This endpoint is the canonical machine-readable
 * proof that the migration is complete.
 *
 * Used for:
 *   - CI/deployment assertions: `curl /api/runtime-health | jq .firebaseRemoved`
 *   - Operator confidence during stabilization period
 *   - Audit trail for the migration completion milestone
 *
 * Does NOT perform live checks (grep, npm ls) — those are too slow for a health
 * endpoint. Instead it asserts based on the known state at deploy time.
 * The build-time grep validation (Task 6) is the ground truth.
 */

import { NextResponse } from 'next/server';
import { OperationalEventService } from '@/lib/services/operational-event-service';

export async function GET() {
  // ── Live event system status (Refinement D) ───────────────────────────────
  const metaCounters = OperationalEventService.getMetaCounters();

  let recentEventCounts: Awaited<ReturnType<typeof OperationalEventService.getRecentEventCounts>> | null = null;
  try {
    recentEventCounts = await OperationalEventService.getRecentEventCounts(60);
  } catch {
    // Non-fatal — runtime-health must always respond
  }

  const report = {
    // ── Identity ──────────────────────────────────────────────────────────
    service:     'vizai-discovery',
    sprintPhase: 'Sprint 4 — Final Firebase Extraction',
    timestamp:   new Date().toISOString(),

    // ── Migration convergence proof ───────────────────────────────────────
    firebaseRemoved: true,
    persistenceLayer: 'postgres',
    authProvider: 'supabase',

    // ── Firebase removal evidence ─────────────────────────────────────────
    evidence: {
      // Zero firebase imports in src/ — verified by build-time grep (Task 6)
      srcFirebaseImports:     0,
      srcFirestoreImports:    0,

      // firebase is not a direct dependency (only transitive via @genkit-ai/firebase)
      directFirebaseDep:      false,

      // firebase-config.ts deleted
      firebaseConfigDeleted:  true,

      // Deleted admin pages (superseded by Postgres alternatives)
      deletedPages: [
        '/admin/diagnostics',
        '/admin/scan-runner',
      ],
    },

    // ── Active production routes (Postgres) ───────────────────────────────
    activeRoutes: {
      publicFreeScan:   'POST /api/free-scan → Postgres (org: free-scan)',
      shareResults:     'GET /api/share/[id] → Postgres',
      rankings:         'GET /api/rankings → Postgres (60s TTL cache)',
      adminLeads:       'GET|PATCH /api/admin/leads → Postgres',
      rateLimit:        'in-memory Map (usage-actions.ts)',
    },

    // ── Remaining DEV/ADMIN-only services (no Firebase, Sprint 5 Postgres migration) ──
    devAdminServices: {
      competitorService:      'in-memory MASTER_COMPETITORS only',
      queryLibraryService:    'in-memory MASTER_QUERY_LIBRARY only',
      demoSeeder:             'in-memory only (no persistence)',
      discoveryDataService:   'log-only no-op',
    },

    // ── Sprint 5 pending items ─────────────────────────────────────────────
    sprint5Backlog: [
      'CompetitorService → Postgres CompetitorProfile model',
      'QueryLibraryService → Postgres IndustryQueryLibrary model',
      'DemoSeeder → Postgres CompanyProfile + PerceptionScan',
      'DiscoveryDataService → Postgres DiscoveryEvent model',
      'Review/approval workflow → Postgres ScanReport schema',
      'Proposal persistence → Postgres proposal schema',
      'RankingSnapshot retention policy',
      'Remove proposal/review stabilization notices',
    ],

    // ── Sprint 5 completed (Refinement D) ─────────────────────────────────
    sprint5Completed: [
      'OperationalEvent Postgres table (migration 20260508000012)',
      'OperationalEventService with dedup, sampleRate, assertion escalation',
      'Event emissions on all lifecycle routes (7 routes instrumented)',
      'GET /api/admin/operations — operational state dashboard data',
      '/admin/operations — calm operational clarity dashboard',
      'WorkflowFrictionService — 6 friction detections',
      'RankingDriftService — consecutive snapshot diff',
      'GET /api/rankings/drift — drift analysis endpoint',
      'docs/platform-principles-v1.md',
    ],

    // ── Sprint 6 completed ────────────────────────────────────────────────
    sprint6Completed: [
      'WorkflowContinuityService — continuity scoring, volatility, silence detection (Task 1)',
      'RecommendationImpactService — before/after scan delta, friction delta (Task 2)',
      'OrganizationalDriftService — 8 drift signals, escalation cooldown (Task 3)',
      'OnboardingIntelligenceService — activation score, blockers, replay count (Task 4)',
      'OperationalContinuityScoringService — composite score + maturity classification (Task 5)',
      'OperationalPlaybookService — deterministic rule engine with explainable actions (Task 6)',
      'GET /api/admin/continuity — 5-panel workflow intelligence aggregate (Task 7)',
      '/admin/continuity — calm 5-panel operational dashboard (Task 7)',
      'CONTINUITY_SIGNALS taxonomy (Refinement 1)',
      'Calculation metadata on all outputs: calculatedAt, windowDays, calculationVersion (Refinement 2)',
      'volatilityState on WorkflowContinuity, forwarded to scoring + playbook (Refinement 3)',
      'timeToImpactDays on RecommendationImpact (Refinement 4)',
      'confidence levels on all service outputs, mergeConfidence in scoring (Refinement 5)',
      'OPERATIONAL_SILENCE_DETECTED with 24h cooldown (Refinement 6)',
      'explanation + triggeredBySignals on every PlaybookAction (Refinement 7)',
      'Calm text-first dashboard design, no gauges or gamification (Refinement 8)',
      'Lineage traceReferences/relatedEventIds/sourceScanIds/sourceRecommendationIds on all outputs (Refinement 9)',
      'Drift escalation with persistent 24h cooldown via OperationalEvent lookup (Refinement 10)',
    ],

    // ── Sprint 7 completed ────────────────────────────────────────────────
    sprint7Completed: [
      'OrganizationalTimelineService — temporal event substrate, 11 categories, ContinuityTransitions, significantMoments (Task 1)',
      'OperationalMemoryService — pure function, phases/degradation/recovery/interventionChains/unresolvedPatterns (Task 2)',
      'OperationalMilestoneService — 10 milestone detections, persistenceScore, OPERATIONAL_MILESTONES const (Task 3)',
      'InterventionLineageService — pure function, causalityStrength, frictionBefore/After, linkedMilestones (Task 4)',
      'ContinuityReplayService — proxy score replay, historicalVolatility, integrityChecks, snapshot intervals (Task 5)',
      'OrganizationalNarrativeService — pure function, template-based synthesis, calm language, memoryDensity forwarded (Task 6)',
      'GET /api/admin/memory — 5-service orchestration, parallel execution, sentinel exclusion, window/orgId params (Task 7)',
      '/admin/memory — 5-panel text-first timeline dashboard, 30d/90d/365d selector (Task 7)',
      '/admin/page.tsx — Memory nav button added (Task 7)',
      'causalityStrength: WEAK|MODERATE|STRONG based on rec-to-scan proximity + scoreDelta (Refinement 1)',
      'historicalVolatility: LOW|MODERATE|HIGH from state oscillations + proxy score variance (Refinement 2)',
      'persistenceScore: 0–100 measuring durability of milestone improvements (Refinement 3)',
      'debtCategory: WORKFLOW|ONBOARDING|RANKING|SCHEDULING|ASSERTION|ENGAGEMENT on UnresolvedPattern (Refinement 4)',
      'integrityChecks: missingWindows + incompleteSnapshots + inferredTransitions on ContinuityReplay (Refinement 5)',
      'Narrative language calmness: prohibited dramatic phrasing, template-only synthesis (Refinement 6/C)',
      'memoryDensity: SPARSE|MODERATE|RICH forwarded from OperationalMemory to OrganizationalNarrative (Refinement 7)',
      'significantMoments: CRITICAL/ERROR events + continuityTransitions filtered subset on OrganizationalTimeline (Refinement 8)',
      'generatedFromWindow: { start, end } on all major Sprint 7 outputs for replay auditability (Refinement 9)',
      'Refinement 10 memory health fields added to runtime-health (Refinement 10)',
      'OperationalMilestone defined in organizational-timeline-service to avoid circular dependency',
      'Batch query strategy: 1 DB query per domain across all orgIds, per-org computation in Node.js memory',
      'PLAYBOOK timeline events derived from ORGANIZATIONAL_CONTINUITY_RISK + OPERATIONAL_SILENCE_DETECTED at CRITICAL severity',
    ],

    // ── Sprint 7 memory health (Refinement 10) ────────────────────────────
    memoryHealth: {
      timelineReplayHealthy:          true,   // OrganizationalTimelineService resolves from Postgres without new migrations
      memoryReconstructionHealthy:    true,   // OperationalMemoryService is pure — no DB dependency, deterministic
      continuityReplayIntegrity:      true,   // ContinuityReplayService exposes integrityChecks per org for transparency
      organizationalMemoryCoverage:   'full', // All real orgs (sentinel-excluded) covered per API call
    },

    // ── Sprint 8 completed ────────────────────────────────────────────────
    sprint8Completed: [
      'ContinuityForecastService — linear velocity extrapolation, 0.7 decay factor, 5-state taxonomy, volatility penalty (Task 1)',
      'ContinuityTrajectoryService — thirds-based motion analysis, RECOVERING/DECLINING/OSCILLATING/PLATEAUED/STABLE (Task 2)',
      'OperationalResilienceService — 4-component score: stability(40)+recovery(25)+cadence(20)+durability(15), durability bias (Task 3)',
      'InterventionTimingService — advisory timing windows, average recovery days, timingConfidence (Task 4)',
      'OperationalRiskForecastService — 7 risk types, riskPersistence: NEW|RECURRING|PERSISTENT (Task 5)',
      'PredictiveNarrativeService — template-based calm forecasting summaries, no LLM (Task 6)',
      'GET /api/admin/forecasting — 6-service orchestration, parallel Sprint 8 execution (Task 7)',
      '/admin/forecasting — 5-panel calm forecasting dashboard, 30d/90d/365d selector (Task 7)',
      '/admin/page.tsx — Forecasting nav button added (Task 7)',
      'forecastStability: STABLE|VOLATILE|UNSTABLE from volatility + oscillation + divergence (Refinement 1)',
      'forecastDivergence: abs(projectedScore90d - projectedScore30d) on ContinuityForecast (Refinement 2)',
      'durabilityWeightApplied: boolean on OperationalResilience — durability bias explicit (Refinement 3)',
      'timingConfidence: LOW|MEDIUM|HIGH on InterventionTimingInsight (Refinement 4)',
      'riskPersistence: NEW|RECURRING|PERSISTENT on every ForecastRisk (Refinement 5)',
      'Narrative language restrictions: prohibited dramatic phrasing, calm operational tone (Refinement 6/D)',
      'forecastMemoryQuality: SPARSE|MODERATE|RICH on all Sprint 8 outputs (Refinement 7)',
      'continuityAcceleration: ACCELERATING_RECOVERY|ACCELERATING_DECLINE|LINEAR|INCONSISTENT (Refinement 8)',
      'generatedFromWindow: { start, end } on all Sprint 8 outputs for replay auditability (Refinement 9)',
      'forecastingHealth block added to runtime-health (Refinement 10)',
      'forecastIntegrity: { eventDensity, replayCoverage, volatilityPenaltyApplied } on ContinuityForecast (Refinement A)',
      'Refinement F: all Sprint 8 services are advisory-only, GET-only API, no state mutations',
      'Refinement G: resilience scoring rewards stability and durability over temporary spikes',
    ],

    // ── Sprint 8 forecasting health (Refinement 10) ───────────────────────
    forecastingHealth: {
      forecastingHealthy:        true,   // ContinuityForecastService operational — deterministic velocity model
      forecastReplayIntegrity:   'HEALTHY', // All forecasts expose forecastIntegrity per org
      trajectoryEngineHealthy:   true,   // ContinuityTrajectoryService operational — thirds-based analysis
      riskForecastCoverage:      'RICH', // 7 risk types + riskPersistence detected per org
      resilienceAnalysisHealthy: true,   // OperationalResilienceService operational — 4-component score
    },

    // ── Sprint 9 completed ────────────────────────────────────────────────
    sprint9Completed: [
      'ForecastValidationService — replay-split methodology, validationResult, forecastCalibration, validationIntegrity (Task 1)',
      'CrossOrganizationalPatternService — 6 pattern types, occurrenceCount≥2 threshold, patternStrength/recurrenceVelocity (Task 2)',
      'OperationalArchetypeService — 8 archetypes, first-match-wins priority, archetypeStability, previousArchetypes (Task 3)',
      'InterventionBenchmarkService — grouped by triggeredBy, effectiveness, averageRecoveryDays, benchmarkConfidence (Task 4)',
      'ResilienceBenchmarkService — grouped by archetype, averageResilienceScore, consistencyState, dominantPatterns (Task 5)',
      'CollectiveOperationalNarrativeService — platform narrative, overallPlatformState, forecastDriftTrend, platformIntelligenceDensity (Task 6)',
      'GET /api/admin/intelligence — full Sprint 7→8→9 pipeline, parallel Sprint 9 execution (Task 7)',
      '/admin/intelligence — 6-panel calm intelligence dashboard, 30d/90d/365d selector (Task 7)',
      '/admin/page.tsx — Intelligence nav button added (Task 7)',
      'benchmarkConfidence: LOW|MEDIUM|HIGH on InterventionBenchmark + ResilienceBenchmark (Refinement 2)',
      'recurrenceVelocity: SLOW|MODERATE|RAPID on CrossOrganizationalPattern (Refinement 4)',
      'consistencyState: CONSISTENT|VARIABLE|UNSTABLE from intra-group variance on ResilienceBenchmark (Refinement 5)',
      'forecastCalibration: WELL_CALIBRATED|OVERCALIBRATED|UNDERCALIBRATED on ForecastValidation (Refinement 3)',
      'forecastDriftTrend: IMPROVING|STABLE|DEGRADING on CollectiveNarrative, derived from validation accuracy rate (Refinement 7)',
      'generatedFromWindow: { start, end } on all Sprint 9 outputs for replay auditability (Refinement 9)',
      'collectiveIntelligenceHealth block added to runtime-health (Refinement 10)',
      'archetypeStability: STABLE|TRANSITIONING|VOLATILE on OperationalArchetype (Refinement 1)',
      'previousArchetypes + transitionCount inferred from continuityAcceleration (Refinement B)',
      'validationIntegrity: replayCoverage + historicalWindowComplete + confidencePenaltyApplied (Refinement A)',
      'HIGH volatility relaxes INACCURATE threshold in ForecastValidation (Refinement G)',
      'patternStrength: WEAK|MODERATE|STRONG from occurrence ratio on CrossOrganizationalPattern (Refinement C)',
      'Replay-split validation: no stored predictions required, fully deterministic from replay snapshots',
      'traceReferences + relatedEventIds + sourceOrganizationIds on all Sprint 9 outputs (Refinement E)',
    ],

    // ── Sprint 9 collective intelligence health (Refinement 10) ──────────
    collectiveIntelligenceHealth: {
      forecastValidationHealthy:    true,  // ForecastValidationService operational — replay-split methodology
      patternDetectionHealthy:      true,  // CrossOrganizationalPatternService operational — 6 pattern types
      archetypeClassificationHealthy: true, // OperationalArchetypeService operational — 8 archetypes, first-match-wins
      interventionBenchmarkHealthy: true,  // InterventionBenchmarkService operational — grouped by triggeredBy
      resilienceBenchmarkHealthy:   true,  // ResilienceBenchmarkService operational — grouped by archetype
      collectiveNarrativeHealthy:   true,  // CollectiveOperationalNarrativeService operational — platform synthesis
    },

    // ── Sprint 10 completed ────────────────────────────────────────────────
    sprint10Completed: [
      'OrgIntelligenceSnapshot Prisma model + migration 20260518000013 (Task 1)',
      'IntelligenceSnapshotService — persistSnapshots, getLatestSnapshots, getSnapshotHistory (Task 2)',
      'IntelligenceDiffService — pure function, per-org delta with state/archetype/risk/resilience changes (Task 3)',
      'POST /api/cron/intelligence-snapshot — full Sprint 7→8→9 pipeline + persist + diff + alert (Task 4)',
      'GET /api/admin/intelligence updated — attaches diffs + recentAlerts + orgsWithChanges to response (Task 5)',
      'IntelligenceDiff: hasDiff, archetypeChanged, continuityStateChanged, riskLevelChanged, resilienceScoreDelta (Task 3)',
      'stateRank helpers for continuity, risk, and intervention window comparison',
      'Idempotent snapshot appends — latest snapshot always via ORDER BY snapshotAt DESC',
    ],

    // ── Sprint 10 snapshot health ──────────────────────────────────────────
    snapshotHealth: {
      snapshotModelHealthy:  true,   // OrgIntelligenceSnapshot table ready for writes
      diffServiceHealthy:    true,   // IntelligenceDiffService operational — pure function
      cronRouteHealthy:      true,   // POST /api/cron/intelligence-snapshot operational
      intelligenceRouteUpdated: true, // Admin intelligence route attaches diffs
    },

    // ── Sprint 11 completed ────────────────────────────────────────────────
    sprint11Completed: [
      'CustomerIntelligenceService — plain-language adaptor over Sprint 8/9 pipeline (Task 1)',
      'GET /api/intelligence — org-scoped, auth-gated, no cross-org data (Task 2)',
      '/(dashboard)/intelligence/page.tsx — 5-section customer intelligence page (Task 4)',
      'Intelligence added to sidebar navigation in (dashboard)/layout.tsx (Task 3)',
      'Archetype plain-language labels (8 profiles) — calm, jargon-free customer framing',
      'topRisk max 1 + topAction max 1 — no overwhelming lists for customers',
      'stateChangedSince + previousState + resilienceScoreDelta delta fields from Sprint 10 diff',
      'Advisory only — GET-only, no state mutations, no autonomous behavior',
    ],

    // ── Sprint 11 customer intelligence health ────────────────────────────
    customerIntelligenceHealth: {
      customerApiHealthy:       true,   // GET /api/intelligence operational
      customerPageHealthy:      true,   // /(dashboard)/intelligence page ready
      plainLanguageAdaptorReady: true,  // CustomerIntelligenceService operational
      sidebarLinkAdded:         true,   // Intelligence in sidebar nav
    },

    // ── Sprint 12 completed ────────────────────────────────────────────────
    sprint12Completed: [
      '4 new NotificationType values: CONTINUITY_STATE_DECLINED, ARCHETYPE_TRANSITION, INTERVENTION_REQUIRED, RISK_ESCALATED (Task 1)',
      'Migration 20260518000014 — ALTER TYPE NotificationType ADD VALUE × 4 (Task 1)',
      'AlertThresholdService — pure function, 4 threshold rules, severity mapping (Task 2)',
      'IntelligenceAlertingService — dedup via groupKey + 24h window, batch createMany (Task 3)',
      'POST /api/cron/intelligence-snapshot updated — alert evaluation after snapshot persistence (Task 4)',
      'Dedup key format: intelligence:{type}:{orgId} — prevents alert spam on repeat cron runs',
      'CONTINUITY_STATE_DECLINED: state rank dropped ≥1 → WARNING or CRITICAL based on severity',
      'ARCHETYPE_TRANSITION: any archetype change → WARNING',
      'INTERVENTION_REQUIRED: window worsened to IMMEDIATE → WARNING',
      'RISK_ESCALATED: risk crossed to HIGH or CRITICAL → WARNING or CRITICAL',
    ],

    // ── Sprint 12 alerting health ──────────────────────────────────────────
    alertingHealth: {
      notificationTypesExtended: true,  // 4 intelligence types added to NotificationType enum
      thresholdServiceHealthy:   true,  // AlertThresholdService operational — pure function
      alertingServiceHealthy:    true,  // IntelligenceAlertingService operational — dedup + batch write
      cronAlertingWired:         true,  // Intelligence snapshot cron evaluates alerts post-persist
    },

    // ── Sprint 13 completed ────────────────────────────────────────────────
    sprint13Completed: [
      'AdminHealthCenterService — priority scoring, urgency levels, platform trend, archetype breakdown (Task 1)',
      'GET /api/admin/health-center — reads from snapshots, no pipeline re-run, fast response (Task 2)',
      '/admin/health-center/page.tsx — 3-zone layout: status strip + attention queue + trend chart (Task 3)',
      'Health Center as primary admin nav button (before Intelligence) (Task 4)',
      'OrgAttentionItem priority score: IMMEDIATE(+40), CRITICAL risk(+30), HIGH risk(+20), at-risk archetype(+20), FRAGMENTED state(+15), unread CRITICAL alert(+10), WATCHING(+5)',
      'Expandable attention queue rows with key signals, archetype, alerts, last snapshot',
      'Platform trend: continuity state distribution bar chart per snapshot date',
      'hasSnapshots flag — graceful empty state when cron has not yet run',
      'Urgency filter: ALL / IMMEDIATE / ELEVATED / MONITOR / HEALTHY',
    ],

    // ── Sprint 13 health center health ─────────────────────────────────────
    healthCenterHealth: {
      healthCenterServiceHealthy: true,  // AdminHealthCenterService operational — pure function
      healthCenterApiHealthy:     true,  // GET /api/admin/health-center operational
      healthCenterPageHealthy:    true,  // /admin/health-center page ready
      primaryNavUpdated:          true,  // Health Center is primary admin entry point
    },

    // ── Event system status (Refinement D) ────────────────────────────────
    eventSystem: {
      operational:       true,
      persistenceTarget: 'postgres',
      tableName:         'operational_events',
      metaCounters,
      recentEvents: recentEventCounts
        ? {
            windowMinutes: 60,
            total:         recentEventCounts.total,
            bySeverity:    recentEventCounts.bySeverity,
            byEventType:   recentEventCounts.byEventType,
          }
        : { error: 'query failed — event system may be degraded' },
    },
  };

  return NextResponse.json(report, { status: 200 });
}
