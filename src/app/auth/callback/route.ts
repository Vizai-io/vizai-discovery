/**
 * @fileOverview GET /auth/callback — Supabase auth code exchange.
 *
 * Handles the server-side PKCE code exchange for:
 * - Email confirmation (after registration)
 * - Password recovery (reset link clicked)
 *
 * Supabase sends users here with ?code=XXX after verifying tokens.
 * We exchange the code for a session, then redirect appropriately.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type"); // "recovery" | "signup" | "email"
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Password recovery → send to reset-password page
      if (type === "recovery") {
        return NextResponse.redirect(new URL("/auth/reset-password", origin));
      }
      // Email confirmation or other → send to dashboard or next
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Code exchange failed — redirect to sign-in with error
  const signInUrl = new URL("/auth/sign-in", request.url);
  signInUrl.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(signInUrl);
}
