/**
 * Prisma configuration (Prisma 7+)
 *
 * Connection URLs live here, not in schema.prisma.
 *
 * DATABASE_URL  — Supabase PgBouncer pooler URL (used by app at runtime)
 * DIRECT_URL    — Supabase direct connection URL (used by `prisma migrate` only)
 */
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
  },
  datasource: {
    // DIRECT_URL is the non-pooled Supabase connection — required for migrations.
    // DATABASE_URL (PgBouncer pooler) is used by the app at runtime.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!,
  },
});
