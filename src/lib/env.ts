/**
 * @fileOverview Environment variable validation.
 *
 * Validates all required env vars at startup using Zod.
 * Throws a clear, descriptive error rather than failing silently.
 *
 * Server-only vars (no NEXT_PUBLIC_ prefix) are safe here.
 * This file must never be imported in client components.
 */

import { z } from "zod";

const envSchema = z.object({
  // ── Database (Supabase / PostgreSQL) ─────────────────────────
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required (Supabase connection pooler URL)"),
  DIRECT_URL: z
    .string()
    .min(1, "DIRECT_URL is required (Supabase direct connection URL for migrations)"),

  // ── Supabase Auth ─────────────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required (server-only, never expose to client)"),

  // ── AI Providers (at least one required for scan engine) ──────
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENAI_API_KEY: z.string().optional(),

  // ── Stripe Billing (optional — billing features disabled if absent) ──
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PROFESSIONAL: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // ── Cron runner ───────────────────────────────────────────────
  CRON_SECRET: z.string().optional(),

  // ── Next.js ───────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

// Validate on module load — fail fast with a clear error
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.errors
    .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
    .join("\n");

  throw new Error(
    `\n\n❌ Invalid environment variables:\n${missing}\n\nCheck your .env.local file.\n`
  );
}

// Warn if no AI providers are configured
const { data: env } = parsed;
if (!env.OPENAI_API_KEY && !env.GOOGLE_GENAI_API_KEY) {
  console.warn(
    "⚠️  No AI provider API keys found. Scans will use simulated results. " +
    "Set OPENAI_API_KEY and/or GOOGLE_GENAI_API_KEY in .env.local."
  );
}

export const ENV = parsed.data!;
