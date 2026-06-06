/**
 * @fileOverview env-check — Required environment variable validation
 *
 * Call `validateEnv()` at application start (e.g. in a top-level server
 * layout or a startup hook) to surface missing configuration early, with
 * a clear actionable message, rather than cryptic runtime failures deep
 * inside request handlers.
 *
 * Rules:
 *  - Throw with a specific list of missing vars — never a generic message
 *  - Separate required (hard stop) from recommended (warning only)
 *  - Never log secret values — only var names
 *  - Call at startup, not per-request
 */

type EnvSpec = {
  name: string;
  description: string;
};

// ── Required vars — application cannot function without these ──────────────
const REQUIRED: EnvSpec[] = [
  { name: "DATABASE_URL", description: "Postgres connection string" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", description: "Supabase project URL" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Supabase anon key" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", description: "Supabase service role key (server-side auth)" },
];

// ── Recommended vars — degraded functionality without these ───────────────
const RECOMMENDED: EnvSpec[] = [
  { name: "OPENAI_API_KEY", description: "OpenAI API key (scan engine)" },
  { name: "GOOGLE_GENAI_API_KEY", description: "Google Gemini API key (scan engine)" },
  { name: "STRIPE_SECRET_KEY", description: "Stripe secret key (billing)" },
  { name: "STRIPE_WEBHOOK_SECRET", description: "Stripe webhook signing secret" },
  { name: "CRON_SECRET", description: "Bearer secret for cron endpoints" },
  { name: "VIZAI_SERVICE_API_KEY", description: "Service-to-service API key" },
  { name: "VIZAI_SERVICE_ORG_ID", description: "Service-to-service organization id" },
];

/**
 * Validate required environment variables.
 *
 * @throws Error listing all missing required vars if any are absent.
 * Logs warnings for missing recommended vars (never throws).
 */
export function validateEnv(): void {
  const missing = REQUIRED.filter((spec) => !process.env[spec.name]);

  if (missing.length > 0) {
    const lines = missing
      .map((spec) => `  ${spec.name} — ${spec.description}`)
      .join("\n");
    throw new Error(
      `Missing required environment variables:\n${lines}\n\nSet these in your .env.local or deployment environment.`,
    );
  }

  const missingRecommended = RECOMMENDED.filter((spec) => !process.env[spec.name]);
  if (missingRecommended.length > 0) {
    const names = missingRecommended.map((s) => s.name).join(", ");
    console.warn(
      `[env-check] Recommended env vars not set: ${names}. Some features may be unavailable.`,
    );
  }
}

/**
 * Assert a single required env var is present and return it.
 * Use at the top of service modules that need a specific key.
 *
 * @throws Error if the var is absent.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Required environment variable "${name}" is not set. Add it to your .env.local or deployment environment.`,
    );
  }
  return value;
}
