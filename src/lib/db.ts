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
import type {ConnectionOptions} from "tls";

// TLS verification is enabled for hosted Postgres. Local non-TLS development
// must opt out explicitly with DATABASE_SSL_MODE=disable.
function databaseSslConfig(): false | ConnectionOptions | undefined {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
  if (mode === "disable") return false;

  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  if (ca) return { rejectUnauthorized: true, ca };

  if (
    mode === "require" ||
    mode === "verify-full" ||
    /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "")
  ) {
    return { rejectUnauthorized: true };
  }

  return undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  // IMPORTANT: We create an explicit pg.Pool and pass it to PrismaPg rather than
  // passing { connectionString, ssl } as a config object. When PrismaPg receives a
  // Pool instance it uses it directly (externalPool path) — the connection string is
  // never re-parsed so sslmode=require cannot shadow our ssl option.
  const pool = new pg.Pool({
    connectionString,
    ssl: databaseSslConfig(),
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
