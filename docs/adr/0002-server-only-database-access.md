# ADR 0002: Server-only application data access

Status: accepted

Application tables are accessed through server-side Prisma routes. Supabase
`anon` and `authenticated` database roles receive no direct table or sequence
privileges in the public schema.

RLS is enabled as defense in depth. Any future browser-direct table must be
introduced through a dedicated security review with explicit policies and
tests rather than broad grants.
