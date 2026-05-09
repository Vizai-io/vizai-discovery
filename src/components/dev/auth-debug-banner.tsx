"use client";

/**
 * @fileOverview AuthDebugBanner — DEV ONLY runtime health display.
 *
 * Visible ONLY when process.env.NODE_ENV === 'development'.
 * Next.js tree-shakes this component out of production builds.
 *
 * Refinement 3: Shows the current auth/provisioning state so developers can
 * immediately diagnose lifecycle fractures without checking network tabs or logs.
 *
 * Displays:
 *   - Supabase session present / missing
 *   - Prisma user provisioned / missing
 *   - organizationId (unassigned = not yet moved to real org)
 *   - role
 *   - onboarding state (derived from organizationId)
 *   - auth source
 *   - traceId (from window if set, or "(no active trace)")
 *
 * This component reads from the useAuth() context — no extra network calls.
 */

import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

export function AuthDebugBanner() {
  // Only render in development — production bundle never includes this
  if (process.env.NODE_ENV !== "development") return null;

  return <AuthDebugBannerInner />;
}

function AuthDebugBannerInner() {
  const { user, userProfile, loading } = useAuth();

  const sessionPresent = !!user;
  const prismaUserPresent = !!userProfile;
  const organizationId = userProfile?.organizationId ?? "—";
  const role = userProfile?.role ?? "—";
  const isUnassigned = organizationId === "unassigned";
  const onboardingState = !prismaUserPresent
    ? "NOT PROVISIONED"
    : isUnassigned
      ? "PENDING ORG ASSIGNMENT"
      : "COMPLETE";

  const statusColor = !sessionPresent
    ? "border-red-400 bg-red-50 text-red-900"
    : !prismaUserPresent
      ? "border-amber-400 bg-amber-50 text-amber-900"
      : isUnassigned
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-green-400 bg-green-50 text-green-900";

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[9999] border-t-2 px-4 py-2 font-mono text-[10px]",
        "flex flex-wrap items-center gap-x-6 gap-y-1",
        statusColor,
      )}
      role="status"
      aria-label="Dev auth state banner"
    >
      {/* Label */}
      <span className="font-black uppercase tracking-widest opacity-60">
        DEV · AUTH/PROVISIONING STATE
      </span>

      {loading ? (
        <span className="opacity-50">loading…</span>
      ) : (
        <>
          <Field
            label="Session"
            value={sessionPresent ? "Active" : "Missing"}
            ok={sessionPresent}
          />
          <Field
            label="Prisma User"
            value={prismaUserPresent ? "Provisioned" : "Missing"}
            ok={prismaUserPresent}
          />
          <Field
            label="Org"
            value={organizationId}
            ok={!isUnassigned && !!userProfile}
          />
          <Field
            label="Role"
            value={role.toUpperCase()}
            ok={!!role && role !== "—"}
          />
          <Field
            label="Onboarding"
            value={onboardingState}
            ok={onboardingState === "COMPLETE"}
          />
          <Field
            label="Auth Source"
            value="Supabase"
            ok={true}
          />
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="opacity-50">{label}:</span>
      <span
        className={cn(
          "font-bold",
          ok ? "text-green-700" : "text-red-600",
        )}
      >
        {value}
      </span>
    </span>
  );
}
