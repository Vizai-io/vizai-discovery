/**
 * @fileOverview Admin layout — server-side role authorization gate.
 *
 * Middleware (Edge Runtime) already confirmed the user is authenticated.
 * This layout checks that the authenticated user has the ADMIN role
 * by reading from Postgres (Node.js runtime — Prisma works here).
 *
 * Non-admin users are redirected to /dashboard.
 */

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/get-auth-context";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAdmin();

  if (!auth) {
    // Not authenticated or not an admin
    redirect("/dashboard");
  }

  return <>{children}</>;
}
