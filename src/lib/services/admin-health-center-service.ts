/**
 * @fileOverview AdminHealthCenterService — Sprint 13 Task 1.
 *
 * Aggregates persisted intelligence snapshots, current diffs, and recent alerts
 * into a single prioritized OrgAttentionItem list for the admin health center.
 *
 * Pure function — no DB queries. All data is pre-fetched by the caller.
 *
 * Priority scoring:
 *   +40  interventionWindow === 'IMMEDIATE'
 *   +30  riskLevel === 'CRITICAL'
 *   +20  riskLevel === 'HIGH'
 *   +20  archetype in at-risk set
 *   +15  continuityState === 'FRAGMENTED' or 'CRITICAL'
 *   +10  unread CRITICAL alert in last 24h
 *   +5   continuityState === 'WATCHING'
 *   Capped at 100.
 *
 * urgencyLevel:
 *   IMMEDIATE — priorityScore ≥ 60
 *   ELEVATED  — ≥ 30
 *   MONITOR   — ≥ 10
 *   HEALTHY   — < 10
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type UrgencyLevel = 'IMMEDIATE' | 'ELEVATED' | 'MONITOR' | 'HEALTHY';

export interface OrgAttentionItem {
  organizationId:  string;
  org:             { name: string; slug: string; tier: string };
  priorityScore:   number;
  urgencyLevel:    UrgencyLevel;
  primaryReason:   string;
  keySignals:      string[];
  archetype:       string;
  continuityState: string;
  riskLevel:       string;
  resilienceScore: number;
  interventionWindow: string;
  lastSnapshotAt?: string;
  recentAlerts:    { type: string; severity: string; title: string; createdAt: string; isRead: boolean }[];
}

export interface PlatformTrend {
  date:              string;
  stableCount:       number;
  watchingCount:     number;
  fragmentedCount:   number;
  criticalCount:     number;
  optimizingCount:   number;
  avgResilienceScore: number;
}

export interface AdminHealthCenter {
  attentionItems:        OrgAttentionItem[];
  platformTrend:         PlatformTrend[];
  archetypeBreakdown:    Record<string, number>;
  alertSummary:          { total: number; critical: number; warning: number; unread: number };
  orgsWithImmediate:     number;
  orgsAtRisk:            number;
  orgsHealthy:           number;
  generatedAt:           string;
}

// ── At-risk archetype set ─────────────────────────────────────────────────────

const AT_RISK_ARCHETYPES = new Set([
  'FRAGMENTING_ORGANIZATION',
  'SILENT_DEGRADER',
  'VOLATILE_OPERATOR',
  'HIGH_INTERVENTION_ORG',
]);

// ── AdminHealthCenterService ──────────────────────────────────────────────────

export class AdminHealthCenterService {
  static compute(
    orgIds:    string[],
    orgMetaMap: Map<string, { name: string; slug: string; tier: string }>,
    snapshots: Map<string, {
      snapshotAt: Date;
      archetype: string;
      continuityState: string;
      riskLevel: string;
      interventionWindow: string;
      resilienceScore: number;
    }>,
    snapshotHistory: Array<{
      organizationId: string;
      snapshotAt: Date;
      continuityState: string;
      resilienceScore: number;
      archetype: string;
      riskLevel: string;
    }>,
    recentAlerts: Array<{
      organizationId: string;
      type: string;
      severity: string;
      title: string;
      createdAt: Date;
      isRead: boolean;
    }>,
  ): AdminHealthCenter {
    const generatedAt   = new Date().toISOString();
    const cutoff24h     = Date.now() - 24 * 60 * 60 * 1000;

    // Group alerts by org
    const alertsByOrg = new Map<string, typeof recentAlerts>();
    for (const alert of recentAlerts) {
      const existing = alertsByOrg.get(alert.organizationId) ?? [];
      existing.push(alert);
      alertsByOrg.set(alert.organizationId, existing);
    }

    // Build attention items
    const attentionItems: OrgAttentionItem[] = [];

    for (const orgId of orgIds) {
      const snap = snapshots.get(orgId);
      const meta = orgMetaMap.get(orgId);
      if (!snap || !meta) continue;

      const orgAlerts    = alertsByOrg.get(orgId) ?? [];
      const hasCritical24h = orgAlerts.some(
        (a) => a.severity === 'CRITICAL' && !a.isRead &&
                new Date(a.createdAt).getTime() >= cutoff24h,
      );

      // Priority score
      let score = 0;
      if (snap.interventionWindow === 'IMMEDIATE')                                 score += 40;
      if (snap.riskLevel === 'CRITICAL')                                            score += 30;
      else if (snap.riskLevel === 'HIGH')                                           score += 20;
      if (AT_RISK_ARCHETYPES.has(snap.archetype))                                  score += 20;
      if (snap.continuityState === 'FRAGMENTED' || snap.continuityState === 'CRITICAL') score += 15;
      if (hasCritical24h)                                                           score += 10;
      if (snap.continuityState === 'WATCHING')                                     score += 5;
      score = Math.min(100, score);

      const urgencyLevel: UrgencyLevel =
        score >= 60 ? 'IMMEDIATE' :
        score >= 30 ? 'ELEVATED'  :
        score >= 10 ? 'MONITOR'   :
        'HEALTHY';

      // Primary reason
      const primaryReason =
        snap.interventionWindow === 'IMMEDIATE'                                    ? 'Immediate intervention recommended' :
        snap.riskLevel === 'CRITICAL'                                              ? 'Critical operational risk level' :
        snap.riskLevel === 'HIGH'                                                  ? 'High operational risk level' :
        AT_RISK_ARCHETYPES.has(snap.archetype)                                     ? `At-risk archetype: ${formatArchetype(snap.archetype)}` :
        snap.continuityState === 'FRAGMENTED' || snap.continuityState === 'CRITICAL' ? `Continuity state: ${snap.continuityState.toLowerCase()}` :
        snap.continuityState === 'WATCHING'                                        ? 'Continuity under observation' :
        'Operating within normal parameters';

      // Key signals (max 3)
      const keySignals: string[] = [];
      if (snap.interventionWindow === 'IMMEDIATE') keySignals.push('Immediate intervention window active');
      if (snap.riskLevel === 'HIGH' || snap.riskLevel === 'CRITICAL')
        keySignals.push(`Risk level: ${snap.riskLevel.toLowerCase()}`);
      if (snap.continuityState !== 'STABLE' && snap.continuityState !== 'OPTIMIZING')
        keySignals.push(`Continuity: ${snap.continuityState.toLowerCase()}`);
      if (snap.resilienceScore < 45)
        keySignals.push(`Resilience score: ${snap.resilienceScore}/100`);

      attentionItems.push({
        organizationId:  orgId,
        org:             meta,
        priorityScore:   score,
        urgencyLevel,
        primaryReason,
        keySignals:      keySignals.slice(0, 3),
        archetype:       snap.archetype,
        continuityState: snap.continuityState,
        riskLevel:       snap.riskLevel,
        resilienceScore: snap.resilienceScore,
        interventionWindow: snap.interventionWindow,
        lastSnapshotAt:  snap.snapshotAt.toISOString(),
        recentAlerts:    orgAlerts.slice(0, 3).map((a) => ({
          type:      a.type,
          severity:  a.severity,
          title:     a.title,
          createdAt: a.createdAt.toISOString(),
          isRead:    a.isRead,
        })),
      });
    }

    // Sort by priority score descending
    attentionItems.sort((a, b) => b.priorityScore - a.priorityScore);

    // Archetype breakdown
    const archetypeBreakdown: Record<string, number> = {};
    for (const item of attentionItems) {
      archetypeBreakdown[item.archetype] = (archetypeBreakdown[item.archetype] ?? 0) + 1;
    }

    // Platform trend — group snapshot history by date
    const trendByDate = new Map<string, { stable: number; watching: number; fragmented: number; critical: number; optimizing: number; scores: number[] }>();
    for (const snap of snapshotHistory) {
      const date = snap.snapshotAt.toISOString().substring(0, 10);
      const entry = trendByDate.get(date) ?? { stable: 0, watching: 0, fragmented: 0, critical: 0, optimizing: 0, scores: [] };
      if (snap.continuityState === 'STABLE')     entry.stable++;
      if (snap.continuityState === 'WATCHING')   entry.watching++;
      if (snap.continuityState === 'FRAGMENTED') entry.fragmented++;
      if (snap.continuityState === 'CRITICAL')   entry.critical++;
      if (snap.continuityState === 'OPTIMIZING') entry.optimizing++;
      entry.scores.push(snap.resilienceScore);
      trendByDate.set(date, entry);
    }

    const platformTrend: PlatformTrend[] = [...trendByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, e]) => ({
        date,
        stableCount:       e.stable,
        watchingCount:     e.watching,
        fragmentedCount:   e.fragmented,
        criticalCount:     e.critical,
        optimizingCount:   e.optimizing,
        avgResilienceScore: e.scores.length > 0
          ? Math.round(e.scores.reduce((a, b) => a + b, 0) / e.scores.length)
          : 0,
      }));

    // Alert summary
    const alertSummary = {
      total:    recentAlerts.length,
      critical: recentAlerts.filter((a) => a.severity === 'CRITICAL').length,
      warning:  recentAlerts.filter((a) => a.severity === 'WARNING').length,
      unread:   recentAlerts.filter((a) => !a.isRead).length,
    };

    // Org counts
    const orgsWithImmediate = attentionItems.filter((i) => i.urgencyLevel === 'IMMEDIATE').length;
    const orgsAtRisk        = attentionItems.filter((i) => i.urgencyLevel === 'ELEVATED').length;
    const orgsHealthy       = attentionItems.filter((i) => i.urgencyLevel === 'HEALTHY').length;

    return {
      attentionItems,
      platformTrend,
      archetypeBreakdown,
      alertSummary,
      orgsWithImmediate,
      orgsAtRisk,
      orgsHealthy,
      generatedAt,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatArchetype(archetype: string): string {
  const labels: Record<string, string> = {
    STABLE_OPERATOR:          'Stable Operator',
    RESILIENT_GROWER:         'Resilient Grower',
    RECOVERY_ORIENTED:        'Recovery-Oriented',
    FRAGMENTING_ORGANIZATION: 'Fragmenting',
    VOLATILE_OPERATOR:        'Volatile Operator',
    SILENT_DEGRADER:          'Silent Degrader',
    HIGH_INTERVENTION_ORG:    'High Intervention',
    PLATEAUED_ORGANIZATION:   'Plateaued',
  };
  return labels[archetype] ?? archetype.replace(/_/g, ' ');
}
