/**
 * @fileOverview POST /api/auth/signout — Sign out the current user.
 *
 * Clears Supabase session cookies server-side.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Sign out error:", err);
    return NextResponse.json({ error: "Sign out failed" }, { status: 500 });
  }
}
