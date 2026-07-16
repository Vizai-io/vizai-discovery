# Registry Intelligence foundation (WP-VIZ-CRAWL-01)

This work package establishes the safe acquisition plane for VizAI's business registry. It does not extract claims, verify facts, prepare registry changes, publish records, or open pull requests. Those capabilities remain disabled until later work packages add evidence review gates and graduated autonomy policies.

## Foundation behavior

A registry target is organization-scoped and bound to an immutable, hash-addressed autonomy policy. Starting a run creates a durable database record and a `pg-boss` job. The worker:

1. validates the target against an HTTPS/domain/port policy;
2. resolves DNS and rejects the entire resolution set if any address is private, reserved, or non-routable;
3. pins the validated address for the request and repeats validation after every redirect;
4. evaluates `robots.txt`, allowing RFC 9309 4xx-unavailable responses and failing closed on unsafe fetches or 5xx-unreachable responses;
5. fetches one approved canonical page within fixed byte, redirect, and time budgets;
6. writes an immutable content-addressed snapshot;
7. records provenance, policy decisions, state transitions, and operational events.

The foundation policy uses `SUPERVISED` autonomy. It cannot self-schedule, discover sources, use a browser, create claim candidates, verify claims, set publication eligibility, prepare registry data, open pull requests, or merge changes.

## Required setup

Copy the placeholder variables from `.env.example` into the deployment secret manager or a local ignored environment file. The worker requires:

- `DATABASE_URL` for Prisma;
- `REGISTRY_QUEUE_DATABASE_URL` (or `DIRECT_URL`) for `pg-boss`;
- snapshot storage configuration;
- Supabase URL and service-role key when `REGISTRY_SNAPSHOT_BACKEND=supabase`.

For Supabase storage, create a private bucket matching `REGISTRY_SNAPSHOT_BUCKET` (default `registry-snapshots`). Do not expose this bucket publicly; snapshots are evidence objects, not website assets.

Apply the reviewed migration through the normal release pipeline:

```powershell
npx prisma migrate deploy
npx prisma generate
```

The implementation does not apply the migration automatically.

## Run locally

Start the Next.js API and the dedicated worker in separate processes:

```powershell
npm run dev
npm run registry:worker
```

The first worker startup may create the `pg-boss` schema when `REGISTRY_QUEUE_MIGRATE=true`. Set it to `false` in environments where database DDL is handled exclusively by a release role, after the queue schema has been provisioned.

## API surface

All endpoints are organization-scoped. Browser sessions follow product roles; issued service keys require explicit scopes.

- `GET /api/registry-intelligence/targets` — `registry:read`
- `POST /api/registry-intelligence/targets` — `registry:policy`
- `POST /api/registry-intelligence/targets/{targetId}/runs` — `registry:run`
- `GET /api/registry-intelligence/runs/{runId}` — `registry:read`
- `POST /api/registry-intelligence/runs/{runId}/pause` — `registry:run`
- `POST /api/registry-intelligence/runs/{runId}/resume` — `registry:run`
- `POST /api/registry-intelligence/runs/{runId}/cancel` — `registry:run`

Issue service keys from the existing admin API with a `scopes` array. A Command Center acquisition key normally needs only:

```json
["registry:read", "registry:run"]
```

Target creation/policy assignment is intentionally separate and requires `registry:policy`.

## Operating controls

Run state transitions are compare-and-set protected. Active states are `QUEUED`, `PLANNING`, `CRAWLING`, `EXTRACTING`, `ASSESSING`, and `PAUSED`; terminal states are `COMPLETE`, `PARTIAL`, `FAILED`, and `CANCELLED`.

The acquisition task uses a deterministic idempotency key and page snapshots are unique by target, normalized URL hash, and content hash. Repeated content reuses the existing object and evidence row.

Pause and cancel are operator actions. Resume reactivates the same durable queue job. A failed enqueue marks the run failed instead of leaving an orphaned queued record.

## Security release checklist

- Rotate any credential that has ever been committed or copied into an example file.
- Keep `.env*` ignored and store production values in the deployment secret manager.
- Grant the snapshot bucket only to the worker service role.
- Use a distinct issued service key per Command Center consumer.
- Start with `registry:read` and `registry:run`; grant `registry:policy` only to an administrative workflow.
- Review operational events and blocked runs before expanding source classes or budgets.
- Never enable claim verification or publication by changing only an environment variable; those capabilities require later code, policy, and review-gate work packages.
