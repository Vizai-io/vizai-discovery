# VizAI Discovery

Private control plane for AI visibility intelligence, truth governance, and
supervised business-registry discovery.

## Architecture

- Next.js 15 App Router web application
- Supabase Auth
- PostgreSQL through Prisma
- Persistent Registry Intelligence worker using pg-boss
- Content-addressed evidence snapshots in private object storage
- Manual, gated publication into the separate public `business-registry`
  repository

`vizai-discovery` contains private operational data, evidence, policies, and
review state. Public registry artifacts are allowlisted projections and never
contain raw evidence or internal notes.

## Local development

Requirements:

- Node.js version from `.nvmrc`
- PostgreSQL/Supabase connection
- `.env.local` based on `.env.example`

```text
npm ci
npm run env:check
npm run dev
```

## Validation

```text
npm run ci:verify
```

This validates environment shape, Prisma migrations, linting, TypeScript,
executable specifications, and the production build.

## Registry worker

The worker is deployed independently from the Vercel web application. See
`docs/registry-worker-deployment.md` and `Dockerfile.worker`.

The foundation crawler enforces:

- explicit organization and service scopes
- robots evaluation
- DNS pinning and SSRF protection
- bounded redirects, response sizes, MIME types, time, and cost
- immutable content-addressed snapshots
- one active run per target
- cooperative pause and cancellation
- no autonomous publication

## Publication boundary

Publication remains a human-approved process:

1. Claims receive evidence-linked verification.
2. Each claim is explicitly marked publishable.
3. Registry-listing consent is recorded for the company profile.
4. A clean public artifact passes local gates.
5. A human opens and reviews a pull request in `business-registry`.
6. The public registry CI remains the final technical gate.

## Security

See `SECURITY.md`. Never commit `.env.local`, raw customer evidence, service
tokens, snapshot objects, or database exports.
