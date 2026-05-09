/**
 * @fileOverview DiscoveryDataService — DEV/ADMIN ONLY — log-only no-op.
 *
 * STATUS: DEV/ADMIN ONLY — not in any production code path.
 *
 * Sprint 4: Firebase removed. Firestore writes to `discoveryDataset` collection
 * stripped. recordDiscoveryEvents() now logs the event summary only.
 *
 * MIGRATION BACKLOG (Sprint 5):
 *   If this functionality is needed in production, migrate to Postgres.
 *   Add a DiscoveryEvent model to schema.prisma.
 *   Do NOT call this from production code paths.
 */

import { QueryDiscoveryData } from "@/lib/types";

export class DiscoveryDataService {
  /**
   * Log-only no-op — Sprint 4.
   * Firestore writes removed. Logs discovery event summary for observability.
   * TODO(Sprint 5): persist to Postgres DiscoveryEvent model.
   */
  static async recordDiscoveryEvents(
    scanId: string,
    industry: string,
    region: string,
    discoveryData: QueryDiscoveryData,
    competitorList: string[],
    targetCompanyName: string
  ): Promise<void> {
    const totalQueries    = discoveryData.queries.length;
    const targetMentioned = discoveryData.queries.filter(q =>
      q.results.some(r => r.isTargetCompanyMentioned)
    ).length;

    console.log('[DiscoveryDataService] recordDiscoveryEvents — log-only (Firestore removed, Sprint 5 Postgres migration pending)', {
      scanId,
      industry,
      region,
      targetCompanyName,
      totalQueries,
      targetMentionedInQueries: targetMentioned,
    });
  }
}
