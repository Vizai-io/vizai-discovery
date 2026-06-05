/**
 * @fileOverview Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter — no built-in Rust engine.
 * Uses @prisma/adapter-pg (node-postgres) with the DATABASE_URL
 * connection pooler URL (Supabase PgBouncer).
 *
 * Singleton pattern prevents multiple PrismaClient instances in
 * Next.js development (hot reloads exhaust the connection pool).
 *
 * SSL note: We construct an explicit pg.Pool and pass it directly to
 * PrismaPg so the adapter uses the "externalPool" path. This bypasses
 * any URL-level sslmode= parsing that could override ssl.rejectUnauthorized.
 * Without this, pg parses sslmode=require from the connection string and
 * ignores the explicit ssl object — causing TLS errors on Windows with
 * Supabase's certificate chain.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// ── Development TLS bypass ─────────────────────────────────────────────────────
// Supabase's certificate chain is not trusted by the local Node.js TLS stack on
// Windows. Setting this BEFORE any connections are opened disables cert rejection
// at the process level, which is the only reliable override — pg's connection-
// string parser can silently win against the ssl object we pass to Pool().
// Guarded to development only: production traffic goes through Vercel's runtime
// which trusts the Supabase cert natively.
if (process.env.NODE_ENV === "development") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  // In development, Supabase's SSL certificate chain may not be trusted by
  // the local Node.js TLS stack (common on Windows). Disable cert verification
  // for local dev only — production uses the pooler which terminates TLS externally.
  //
  // IMPORTANT: We create an explicit pg.Pool and pass it to PrismaPg rather than
  // passing { connectionString, ssl } as a config object. When PrismaPg receives a
  // Pool instance it uses it directly (externalPool path) — the connection string is
  // never re-parsed so sslmode=require cannot shadow our ssl option.
  const pool = new pg.Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === "development"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
