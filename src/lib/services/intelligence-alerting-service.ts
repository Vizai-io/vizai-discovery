/**
 * @fileOverview IntelligenceAlertingService — Sprint 12 Task 3.
 *
 * Orchestrates threshold evaluation, deduplication, and Notification writes
 * for intelligence-driven alerts.
 *
 * Called by /api/cron/intelligence-snapshot after snapshot persistence.
 *
 * Deduplication strategy:
 *   groupKey format: `intelligence:{type}:{orgId}`
 *   Before writing, checks for an unread notification with the same groupKey
 *   created in the last 24 hours. Skips if one exists (prevents alert spam
 *   when cron runs multiple times per day).
 */

import { db }                           from '@/lib/db';
import type { IntelligenceDiff }        from './intelligence-diff-service';
import type { OperationalRiskForecast } from './operational-risk-forecast-service';
import type { InterventionTimingInsight } from './intervention-timing-service';
import { AlertThresholdService }         from './alert-threshold-service';

// ── IntelligenceAlertingService ───────────────────────────────────────────────

export class IntelligenceAlertingService {
  /**
   * Evaluate diffs, deduplicate, and write notifications for all triggered alerts.
   */
  static async processAlerts(
    diffs:     IntelligenceDiff[],
    riskMap:   Map<string, OperationalRiskForecast>,
    timingMap: Map<string, InterventionTimingInsight>,
  ): Promise<{ fired: number; deduplicated: number }> {
    // Evaluate all thresholds
    const candidates = AlertThresholdService.evaluateAll(diffs, riskMap, timingMap);

    if (candidates.length === 0) return { fired: 0, deduplicated: 0 };

    // Dedup check: find existing unread notifications with these groupKeys in the last 24h
    const groupKeys    = candidates.map((c) => c.groupKey);
    const cutoff       = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingKeys = await db.notification.findMany({
      where: {
        groupKey:  { in: groupKeys },
        isRead:    false,
        createdAt: { gte: cutoff },
      },
      select: { groupKey: true },
    });

    const existingSet = new Set(existingKeys.map((n) => n.groupKey).filter(Boolean) as string[]);

    // Filter out deduplicated candidates
    const toFire      = candidates.filter((c) => !existingSet.has(c.groupKey));
    const deduplicated = candidates.length - toFire.length;

    if (toFire.length === 0) return { fired: 0, deduplicated };

    // Write notifications in a single batch
    await db.notification.createMany({
      data: toFire.map((c) => ({
        organizationId: c.organizationId,
        type:           c.type,
        severity:       c.severity,
        title:          c.title,
        message:        c.message,
        groupKey:       c.groupKey,
        isRead:         false,
      })),
    });

    return { fired: toFire.length, deduplicated };
  }
}
