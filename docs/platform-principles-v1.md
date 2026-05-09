# VizAI Platform Principles — v1

**Sprint 5 · Sprint Phase: Operational Intelligence + Platform Observability**

These principles govern all platform engineering decisions. They are not guidelines — they are constraints. Any change that violates a principle requires an explicit exception and a recorded rationale.

---

## 1. One Canonical Persistence Layer

**Postgres is the single canonical persistence layer.** There is no second source of truth.

- All user-facing state must be readable from Postgres
- No new persistence targets may be introduced without deprecating an existing one
- In-memory state (caches, dedup maps, counters) is ephemeral and explicitly labelled as such
- Firebase was fully eliminated in Sprint 4. See [`docs/deleted-runtime-surfaces.md`](deleted-runtime-surfaces.md) for the complete audit registry.

---

## 2. One Active Execution Path

**There must only be one active execution path for any lifecycle operation.**

- A single `runAndPersistScan()` path for authenticated scans
- A single `ScanEngine.runFreeScan()` path for public scans
- No A/B paths, no feature-flag forks, no hybrid systems
- Parallel paths must be resolved to one before shipping

---

## 3. Deletion Over Compatibility

**Prefer deletion over compatibility layers.**

When removing a deprecated system, delete it entirely rather than wrapping it. Compatibility layers create two execution paths (Principle 2) and make state ambiguous (Principle 1).

Evidence of deletion is recorded in [`docs/deleted-runtime-surfaces.md`](deleted-runtime-surfaces.md). Every deleted surface has:
- The file or function deleted
- The sprint that deleted it
- The replacement (if any)

### Deletion philosophy

A dead code path is worse than no code path — it signals intent that cannot be fulfilled and creates confusion during debugging. When we delete Firebase surfaces, we do not build adapters. We delete the call sites, the configs, and the packages. The deletion itself is the documentation.

**Good deletion practice:**
1. Identify the full callgraph of the surface to be deleted
2. Delete leaf nodes first (callers), then the surface itself
3. Confirm no remaining imports via grep — this is enforced at build time
4. Register the deletion in `docs/deleted-runtime-surfaces.md`

---

## 4. Operational Observability Is Non-Negotiable

**Every lifecycle boundary emits a structured event.**

The `OperationalEventService` (Sprint 5) is the canonical event emission layer. Every route that mutates state or completes a lifecycle phase must call:

```typescript
void OperationalEventService.emit({ eventType, severity, source, traceId, ... })
```

Rules:
- Fire-and-forget: never await in the response path, always use `void`
- Never throws: the service swallows all errors and increments `metaCounters.writeFailures`
- TraceId: every event carries the request's `traceId` for correlation
- Source taxonomy: use `EVENT_SOURCES` constants — no ad-hoc strings

### Operational calmness states

The platform has four calmness states derived from the last hour of events:

| State     | Condition                                  |
|-----------|--------------------------------------------|
| CALM      | Zero errors and zero critical events        |
| WATCHING  | ≥1 WARNING, no errors or critical          |
| DEGRADED  | ≥1 ERROR, no critical events               |
| CRITICAL  | ≥1 CRITICAL event in the last hour         |

These states are visible at `/admin/operations`.

---

## 5. Assertions Are Infrastructure

**Pipeline integrity assertions are first-class infrastructure, not defensive code.**

Every persist operation that feeds a user-visible surface must have a post-persist assertion. Assertion failures emit `OPERATIONAL_EVENT` records — they are not silent `console.error` calls.

Assertion escalation (Sprint 5): when more than 5 of the same assertion type fire within 1 hour, a `SYSTEM_RUNTIME_DEGRADATION CRITICAL` event is automatically emitted. This is enforced in `OperationalEventService`.

**Assertion types:**
- `FREE_SCAN_PIPELINE_INCOMPLETE` — free scan missing stages
- `PUBLIC_RUNTIME_FLOW_BROKEN` — acquisition funnel broken
- `RANKING_PIPELINE_INCOMPLETE` — ranking snapshot post-persist check

---

## 6. TraceId on Every Request

**Every request handler must generate a `traceId` at entry and include it on all logs and events.**

```typescript
const traceId = crypto.randomUUID();
```

TraceId must be:
- Included in all `console.log` / `console.error` structured log objects
- Passed to `OperationalEventService.emit()` as the `traceId` field
- Returned to the caller in error responses (`{ error: '...', traceId }`)
- Propagated to child events via `metadata.parentTraceId` (Refinement B)

---

## 7. Migration Stabilization Discipline

**During active migration phases, product consistency takes priority over feature velocity.**

The stabilization notice pattern (amber banner, save disabled) is used when a surface is partially migrated and cannot be safely written to yet. This is preferable to silently writing to a broken or ambiguous persistence target.

Sprint 4 stabilization notices are marked with:
```
// Refinement 3: Stabilization Sprint 4 — save disabled
```

These notices must be removed in the sprint that completes the migration (Sprint 5 or later).

---

## 8. No New Infrastructure During Migration Stabilization

**Do not introduce new infrastructure (databases, queues, external services) while an active migration is in progress.**

The migration period ends when:
- The old system has zero imports in `src/`
- The deletion is registered in `docs/deleted-runtime-surfaces.md`
- The runtime-health endpoint confirms `firebaseRemoved: true`

Any new infrastructure introduction must be preceded by migration completion.

---

## 9. Workflow Friction Is Monitored

**The platform actively detects its own bottlenecks.**

`WorkflowFrictionService` (Sprint 5) runs periodic Postgres queries to detect:
- Onboarding abandonment (users stuck in "unassigned" org)
- Stuck scans (PENDING/RUNNING for >10 minutes)
- Failed scan streaks
- Ignored recommendation backlogs
- Stale unread notifications
- Repeated pipeline assertions

Friction signals are visible at `/admin/operations` alongside the event stream.

---

## 10. Ranking Drift Is Tracked

**Changes in the competitive leaderboard are explicitly tracked and comparable.**

`RankingDriftService` (Sprint 5) diffs consecutive `RankingSnapshot` entries to detect:
- Position changes (IMPROVED / DECLINED)
- New market entrants (NEW_ENTRANT)
- Competitors that dropped out (DROPPED_OUT)

Every drift report includes `snapshotIds: { current, previous }` for auditability. Reports are available at `GET /api/rankings/drift`.

---

## Appendix: Deleted Runtime Surfaces

See [`docs/deleted-runtime-surfaces.md`](deleted-runtime-surfaces.md) for the complete audit registry of all deleted Firebase and deprecated surfaces.

---

*Platform Principles v1 — Sprint 5. Next review: Sprint 6 kickoff.*
