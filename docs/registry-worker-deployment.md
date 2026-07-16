# Registry worker deployment

Registry crawling runs in a persistent process separate from the Vercel web
deployment.

## Release sequence

1. Apply Prisma migrations using `DIRECT_URL`.
2. Run `npm run registry:queue:provision` once with
   `REGISTRY_QUEUE_MIGRATE=true`.
3. Deploy `Dockerfile.worker` with `REGISTRY_QUEUE_MIGRATE=false`.
4. Configure the platform health check to use `GET /readyz` on port `8081`.

The runtime worker credential needs data access to the application and
`pgboss` schemas but should not own schemas or have DDL privileges.

## Required worker configuration

- `DATABASE_URL`
- `REGISTRY_QUEUE_DATABASE_URL`
- `REGISTRY_QUEUE_MIGRATE=false`
- `REGISTRY_SNAPSHOT_BACKEND=supabase`
- `REGISTRY_SNAPSHOT_BUCKET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `RATE_LIMIT_HASH_SECRET`
- at least one configured AI provider key

The worker exposes:

- `/healthz`: process liveness
- `/readyz`: queue consumer and probe server readiness
- `/metrics`: Prometheus counters for started, completed, failed and active jobs
