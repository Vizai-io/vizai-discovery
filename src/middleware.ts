/**
 * @fileOverview Next.js middleware — authentication gate.
 *
 * Runs in Edge Runtime on every matching request.
 * Responsibilities:
 * 1. Refresh the Supabase session (keeps tokens alive)
 * 2. Redirect unauthenticated users away from protected routes
 * 3. Redirect authenticated users away from auth pages
 *
 * NOTE: Role-based admin authorization is NOT checked here — Edge Runtime
 * cannot use Prisma. Admin role verification happens in:
 *   - src/app/admin/layout.tsx (server component, Node.js)
 *   - API routes via requireAdmin()
 */

import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

// Routes that require authentication (any role)
const PROTECTED_PREFIXES = ["/dashboard", "/scans", "/admin"];

// Routes that should redirect to /dashboard if already authenticated
const AUTH_PREFIXES = ["/auth/sign-in", "/auth/register"];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createMiddlewareClient(request, response);

  // Refresh session — this is the primary purpose of middleware for Supabase SSR.
  // getUser() validates the session with Supabase servers (not just local cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Redirect unauthenticated users trying to access protected routes
  if (!user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Redirect authenticated users away from sign-in / register
  if (user && AUTH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, fonts, etc.)
     * - api/health (public health check)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)|api/health).*)",
  ],
};
