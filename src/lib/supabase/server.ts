/**
 * @fileOverview Supabase server client.
 *
 * Use this in:
 * - Server Components
 * - API Route handlers (route.ts)
 * - Server Actions
 *
 * Reads and writes auth cookies via Next.js cookies() API.
 * Never use this in Client Components — use client.ts instead.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — cookies are read-only
            // in that context. The middleware handles session refresh instead.
          }
        },
      },
    }
  );
}

/**
 * Supabase admin client — uses the service role key.
 * Bypasses Row Level Security. Use ONLY in trusted server-side contexts.
 * Never expose this client or its key to the browser.
 */
export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
