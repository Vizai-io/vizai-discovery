/**
 * @fileOverview Supabase browser client.
 *
 * Use this in Client Components only (hooks, event handlers, etc.).
 * For Server Components and API routes, use server.ts instead.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
