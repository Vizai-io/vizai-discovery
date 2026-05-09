# Deleted Runtime Surfaces

> Refinement 4 — Sprint 4 (Firebase Elimination)
>
> Registry of all runtime surfaces deleted during the Firebase → Postgres migration.
> Provides an audit trail so nothing is accidentally re-introduced.
> If a deleted surface needs to be revived, a new implementation targeting Postgres must be written.

---

## Sprint 3 Deletions

| Surface | Path | Reason | Sprint |
|---|---|---|---|
| `real-query-engine.ts` | `src/lib/services/real-query-engine.ts` | Confirmed dead code — no callers after query-library-service migration | Sprint 3, Task 4 |

---

## Sprint 4 Deletions

| Surface | Path | Reason | Sprint |
|---|---|---|---|
| `firebase-config.ts` | `src/lib/firebase-config.ts` | Firebase fully removed — no remaining imports | Sprint 4, Task 4 |
| `admin/diagnostics/page.tsx` | `src/app/admin/diagnostics/page.tsx` | Superseded by admin stats (Postgres) — Firestore diagnostic queries are obsolete | Sprint 4, Task 2 |
| `admin/scan-runner/page.tsx` | `src/app/admin/scan-runner/page.tsx` | Superseded by Postgres cron-based batch scanning — manual Firestore trigger obsolete | Sprint 4, Task 2 |

---

## Firebase Surface Classification (as of Sprint 4)

| File | Classification | Notes |
|---|---|---|
| `src/lib/services/ranking-service.ts` | ✅ MIGRATED (Sprint 4) | Firebase removed; static utility only; reads via `GET /api/rankings` |
| `src/lib/services/competitor-service.ts` | ✅ MIGRATED (Sprint 4) | Firebase removed; in-memory `MASTER_COMPETITORS` only |
| `src/lib/services/demo-seeder.ts` | ✅ MIGRATED (Sprint 4) | Firebase removed; in-memory only; Firestore writes stripped |
| `src/lib/services/query-library-service.ts` | ✅ MIGRATED (Sprint 4) | Firebase removed; static `MASTER_QUERY_LIBRARY` only |
| `src/lib/services/discovery-data-service.ts` | ✅ MIGRATED (Sprint 4) | Firebase removed; log-only no-op |
| `src/lib/firebase-config.ts` | ✅ DELETED (Sprint 4) | Zero remaining imports after Sprint 4 migration |

---

## Production Runtime — Firebase-Free Confirmation

After Sprint 4:
- Zero `import ... from 'firebase'` in `src/`
- Zero `import ... from 'firebase/firestore'` in `src/`
- `firebase` package removed from `node_modules`
- All production routes target Postgres exclusively via Prisma
- `GET /api/runtime-health` returns `firebaseRemoved: true` convergence proof

---

*Last updated: 2026-05-08 — Sprint 4 complete*
