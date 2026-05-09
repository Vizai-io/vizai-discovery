/**
 * @fileOverview Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter — no built-in Rust engine.
 * Uses @prisma/adapter-pg (node-postgres) with the DATABASE_URL
 * connection pooler URL (Supabase PgBouncer).
 *
 * Singleton pattern prevents multiple PrismaClient instances in
 * Next.js development (hot reloads exhaust the connection pool).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
