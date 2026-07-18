/**
 * @fileOverview OperationalEventService — Sprint 5 Platform Observability.
 *
 * Canonical event emission layer. Every lifecycle boundary (scans, onboarding,
 * rankings, share, admin actions) emits a structured OperationalEvent to Postgres.
 *
 * Usage pattern — always fire-and-forget:
 *   void OperationalEventService.emit({ ... })
 *
 * Design constraints:
 *   - Never throws — all errors are caught, logged, and counted.
 *   - Never blocks the caller's response path.
 *   - Idempotent by replayKey: `${eventType}:${entityId}:${minute}` (Refinement E).
 *   - In-memory dedup (5-min TTL) suppresses repeat identical signals.
 *   - sampleRate gate: drop high-volume events by fraction (Refinement 3).
 *   - Assertion escalation: >5 of same assertion type in 1h → SYSTEM_RUNTIME_DEGRADATION CRITICAL (Refinement C).
 *   - Meta-observability counters (Refinement 4): writeFailures, throughput, dedupSkips, sampleSkips.
 *
 * Correlation (Refinement B):
 *   metadata.parentTraceId  — links child event to a parent trace
 *   metadata.relatedEntityIds — list of related entity IDs for causal graphs
 */

import { db } from '@/lib/db';

// ── Event Type constants ──────────────────────────────────────────────────────

export const EVENT_TYPES = {
  // Public acquisition funnel
  FREE_SCAN_STARTED:             'FREE_SCAN_STARTED',
  FREE_SCAN_COMPLETED:           'FREE_SCAN_COMPLETED',
  FREE_SCAN_PIPELINE_INCOMPLETE: 'FREE_SCAN_PIPELINE_INCOMPLETE',  // assertion
  PUBLIC_RUNTIME_FLOW_BROKEN:    'PUBLIC_RUNTIME_FLOW_BROKEN',     // assertion

  // Share / public artifact access
  SHARE_PAGE_ACCESSED:           'SHARE_PAGE_ACCESSED',

  // Ranking pipeline
  RANKING_SNAPSHOT_GENERATED:    'RANKING_SNAPSHOT_GENERATED',
  RANKING_PIPELINE_INCOMPLETE:   'RANKING_PIPELINE_INCOMPLETE',    // assertion

  // Authenticated scan lifecycle
  SCAN_STARTED:                  'SCAN_STARTED',
  SCAN_COMPLETED:                'SCAN_COMPLETED',
  SCAN_FAILED:                   'SCAN_FAILED',

  // Security & Trust — web posture scan (WP-SEC-SCAN-01)
  SECURITY_SCAN_STARTED:         'SECURITY_SCAN_STARTED',
  SECURITY_SCAN_COMPLETED:       'SECURITY_SCAN_COMPLETED',
  SECURITY_SCAN_FAILED:          'SECURITY_SCAN_FAILED',

  // User lifecycle
  USER_PROVISIONED:              'USER_PROVISIONED',
  ONBOARDING_COMPLETED:          'ONBOARDING_COMPLETED',

  // Admin operations
  PROVISIONING_REPLAY:           'PROVISIONING_REPLAY',
  ADMIN_ACTION:                  'ADMIN_ACTION',
  API_KEY_CREATED:               'API_KEY_CREATED',
  API_KEY_REVOKED:               'API_KEY_REVOKED',

  // System / escalation (emitted automatically by assertion escalation logic)
  SYSTEM_RUNTIME_DEGRADATION:    'SYSTEM_RUNTIME_DEGRADATION',

  // Sprint 6 — Operational cognition events
  ORGANIZATIONAL_CONTINUITY_RISK: 'ORGANIZATIONAL_CONTINUITY_RISK',  // Refinement B
  OPERATIONAL_SILENCE_DETECTED:   'OPERATIONAL_SILENCE_DETECTED',    // Refinement 6

  // Sprint 10 — Intelligence snapshot cron
  INTELLIGENCE_SNAPSHOT_COMPLETED: 'INTELLIGENCE_SNAPSHOT_COMPLETED',

  // WP-VIZ-CRAWL-01 — Registry Intelligence foundation
  REGISTRY_TARGET_CREATED:              'REGISTRY_TARGET_CREATED',
  REGISTRY_CRAWL_RUN_PLANNED:           'REGISTRY_CRAWL_RUN_PLANNED',
  REGISTRY_CRAWL_PAGE_FETCHED:          'REGISTRY_CRAWL_PAGE_FETCHED',
  REGISTRY_CRAWL_PAGE_BLOCKED:          'REGISTRY_CRAWL_PAGE_BLOCKED',
  REGISTRY_POLICY_CIRCUIT_BREAKER_OPENED: 'REGISTRY_POLICY_CIRCUIT_BREAKER_OPENED',
  REGISTRY_RUN_COMPLETED:               'REGISTRY_RUN_COMPLETED',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ── Event Source constants (Refinement 1) ─────────────────────────────────────
//
// Source taxonomy: one entry per API route that emits events.
// Format: `api:<path>` for route handlers, `system:<name>` for internal.

export const EVENT_SOURCES = {
  FREE_SCAN_API:   'api:free-scan',
  SHARE_API:       'api:share',
  RANKINGS_API:    'api:rankings',
  SCAN_API:        'api:scan',
  SECURITY_SCAN_API: 'api:security-scan',
  ONBOARDING_API:  'api:onboarding',
  AUTH_API:        'api:auth/me',
  ADMIN_USERS_API:              'api:admin/users',
  ADMIN_API_KEYS_API:           'api:admin/api-keys',
  SYSTEM_INTERNAL:              'system:internal',  // assertion escalation, meta-health
  CRON_INTELLIGENCE_SNAPSHOT:   'cron:intelligence-snapshot',
  REGISTRY_INTELLIGENCE_API:    'api:registry-intelligence',
  REGISTRY_INTELLIGENCE_WORKER: 'worker:registry-intelligence',
} as const;

export type EventSource = (typeof EVENT_SOURCES)[keyof typeof EVENT_SOURCES];

// ── Severity constants ────────────────────────────────────────────────────────

export const SEVERITIES = {
  INFO:     'INFO',
  WARNING:  'WARNING',
  ERROR:    'ERROR',
  CRITICAL: 'CRITICAL',
} as const;

export type Severity = (typeof SEVERITIES)[keyof typeof SEVERITIES];

// ── Emit parameters ───────────────────────────────────────────────────────────

export interface EmitParams {
  eventType:       EventType;
  severity:        Severity;
  source:          EventSource;
  traceId:         string;
  message:         string;
  organizationId?: string;
  userId?:         string;
  entityType?:     string;       // 'scan' | 'user' | 'org' | 'ranking' | 'notification' | 'schedule'
  entityId?:       string;       // cuid of the related entity
  /** Refinement 3: fraction of events to write. Default 1.0 = always. */
  sampleRate?:     number;
  /**
   * Metadata payload. Supports:
   *   parentTraceId:     string            — Refinement B: parent trace correlation
   *   relatedEntityIds:  string[]          — Refinement B: related entity IDs
   *   replayKey:         string            — Refinement E: set automatically if not provided
   *   [custom fields]:   unknown           — any additional context
   */
  metadata?:       Record<string, unknown>;
}

// ── In-memory dedup (5-min TTL) ───────────────────────────────────────────────
//
// Keyed by `${eventType}:${entityId ?? '_'}:${source}`.
// Prevents identical signals from flooding the event table during retries or
// concurrent requests hitting the same pipeline.

interface DedupEntry { expiresAt: number; }

const dedupMap = new Map<string, DedupEntry>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(eventType: string, entityId: string | undefined, source: string): boolean {
  const key = `${eventType}:${entityId ?? '_'}:${source}`;
  const entry = dedupMap.get(key);
  if (entry && Date.now() < entry.expiresAt) return true;
  dedupMap.set(key, { expiresAt: Date.now() + DEDUP_TTL_MS });
  return false;
}

// ── Meta-observability counters (Refinement 4) ───────────────────────────────
//
// Sliding in-memory counters since server start.
// Exposed via getMetaCounters() for /api/admin/operations and /api/runtime-health.

interface MetaCounters {
  writeFailures: number;
  throughput:    number;  // total events written to Postgres since server start
  dedupSkips:    number;
  sampleSkips:   number;
}

const metaCounters: MetaCounters = {
  writeFailures: 0,
  throughput:    0,
  dedupSkips:    0,
  sampleSkips:   0,
};

// ── Assertion escalation tracker (Refinement C) ──────────────────────────────
//
// Tracks rolling count of assertion-type events per eventType within a 1-hour window.
// When the count exceeds ASSERTION_ESCALATION_THRESHOLD, emits a
// SYSTEM_RUNTIME_DEGRADATION CRITICAL event.
//
// Assertion types are events that signal something has gone wrong in the pipeline:
//   FREE_SCAN_PIPELINE_INCOMPLETE, PUBLIC_RUNTIME_FLOW_BROKEN, RANKING_PIPELINE_INCOMPLETE.

const ASSERTION_ESCALATION_THRESHOLD = 5;
const ASSERTION_WINDOW_MS            = 60 * 60 * 1000; // 1 hour

const ASSERTION_EVENT_TYPES = new Set<EventType>([
  EVENT_TYPES.FREE_SCAN_PIPELINE_INCOMPLETE,
  EVENT_TYPES.PUBLIC_RUNTIME_FLOW_BROKEN,
  EVENT_TYPES.RANKING_PIPELINE_INCOMPLETE,
]);

interface AssertionWindow {
  count:       number;
  windowStart: number;
}

const assertionWindows = new Map<EventType, AssertionWindow>();

/**
 * Returns true if the assertion count for this eventType has crossed the
 * escalation threshold within the rolling window (and resets the counter).
 */
function checkAssertionEscalation(eventType: EventType): boolean {
  if (!ASSERTION_EVENT_TYPES.has(eventType)) return false;

  const now      = Date.now();
  const existing = assertionWindows.get(eventType);

  if (!existing || (now - existing.windowStart) > ASSERTION_WINDOW_MS) {
    // New window — reset
    assertionWindows.set(eventType, { count: 1, windowStart: now });
    return false;
  }

  existing.count++;

  if (existing.count > ASSERTION_ESCALATION_THRESHOLD) {
    // Reset after escalation to avoid continuous re-escalation
    assertionWindows.set(eventType, { count: 0, windowStart: now });
    return true;
  }

  return false;
}

// ── OperationalEventService ───────────────────────────────────────────────────

export class OperationalEventService {
  /**
   * Emit a structured operational event to Postgres.
   *
   * Always call with `void` — this method is fire-and-forget:
   *   void OperationalEventService.emit({ ... })
   *
   * Will never throw. Will never block. Will never affect the caller's response.
   */
  static async emit(params: EmitParams): Promise<void> {
    try {
      // ── Refinement 3: sample rate gate ─────────────────────────────────────
      const sampleRate = params.sampleRate ?? 1.0;
      if (sampleRate < 1.0 && Math.random() > sampleRate) {
        metaCounters.sampleSkips++;
        return;
      }

      // ── Dedup gate ──────────────────────────────────────────────────────────
      if (isDuplicate(params.eventType, params.entityId, params.source)) {
        metaCounters.dedupSkips++;
        return;
      }

      // ── Refinement E: replayKey ─────────────────────────────────────────────
      // Keyed by minute so replaying within the same minute is idempotent.
      // Callers may override via metadata.replayKey.
      const minute    = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
      const replayKey = (params.metadata?.replayKey as string | undefined)
        ?? `${params.eventType}:${params.entityId ?? '_'}:${minute}`;

      const metadataJson: Record<string, unknown> = {
        ...params.metadata,
        replayKey,
      };

      // ── Write to Postgres ───────────────────────────────────────────────────
      await db.operationalEvent.create({
        data: {
          organizationId: params.organizationId ?? null,
          userId:         params.userId         ?? null,
          eventType:      params.eventType,
          severity:       params.severity,
          source:         params.source,
          traceId:        params.traceId,
          entityType:     params.entityType     ?? null,
          entityId:       params.entityId       ?? null,
          message:        params.message,
          metadataJson:   metadataJson as any,
        },
      });

      metaCounters.throughput++;

      // ── Refinement C: assertion escalation check ────────────────────────────
      if (checkAssertionEscalation(params.eventType)) {
        const escalationTraceId = crypto.randomUUID();
        const escalationMinute  = new Date().toISOString().slice(0, 16);

        await db.operationalEvent.create({
          data: {
            eventType: EVENT_TYPES.SYSTEM_RUNTIME_DEGRADATION,
            severity:  SEVERITIES.CRITICAL,
            source:    EVENT_SOURCES.SYSTEM_INTERNAL,
            traceId:   escalationTraceId,
            message:   `Assertion escalation: ${params.eventType} exceeded ${ASSERTION_ESCALATION_THRESHOLD} occurrences within 1 hour`,
            metadataJson: {
              triggerEventType:  params.eventType,
              threshold:         ASSERTION_ESCALATION_THRESHOLD,
              windowMs:          ASSERTION_WINDOW_MS,
              replayKey: `${EVENT_TYPES.SYSTEM_RUNTIME_DEGRADATION}:escalation-${params.eventType}:${escalationMinute}`,
            } as any,
          },
        });

        metaCounters.throughput++;

        console.error('[OperationalEventService] ASSERTION ESCALATION → SYSTEM_RUNTIME_DEGRADATION CRITICAL', {
          triggerEventType:  params.eventType,
          escalationTraceId,
          threshold:         ASSERTION_ESCALATION_THRESHOLD,
        });
      }

    } catch (err: any) {
      metaCounters.writeFailures++;
      // Structured log — never propagate, never block
      console.error('[OperationalEventService] emit failed (non-fatal)', {
        eventType:     params.eventType,
        source:        params.source,
        traceId:       params.traceId,
        error:         err?.message,
        writeFailures: metaCounters.writeFailures,
      });
    }
  }

  /**
   * Returns in-memory meta-observability counters (Refinement 4).
   * Used by /api/admin/operations and /api/runtime-health.
   * Values reflect server lifetime — reset on each deploy/restart.
   */
  static getMetaCounters(): Readonly<MetaCounters> {
    return { ...metaCounters };
  }

  /**
   * Returns aggregated event counts from Postgres for the last N minutes.
   * Used by /api/admin/operations for operational state derivation.
   */
  static async getRecentEventCounts(windowMinutes: number = 60): Promise<{
    bySeverity:  Record<string, number>;
    byEventType: Record<string, number>;
    total:       number;
  }> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const events = await db.operationalEvent.findMany({
      where:  { createdAt: { gte: since } },
      select: { eventType: true, severity: true },
    });

    const bySeverity:  Record<string, number> = {};
    const byEventType: Record<string, number> = {};

    for (const e of events) {
      bySeverity[e.severity]    = (bySeverity[e.severity]    ?? 0) + 1;
      byEventType[e.eventType]  = (byEventType[e.eventType]  ?? 0) + 1;
    }

    return { bySeverity, byEventType, total: events.length };
  }
}
