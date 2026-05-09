"use client";

/**
 * @fileOverview /billing — Subscription and billing management.
 *
 * Reads billing state from GET /api/billing/status (DB-backed, no Stripe API calls).
 * Checkout: POST /api/billing/create-checkout-session → redirect to Stripe Checkout.
 * Portal:   POST /api/billing/create-portal-session → redirect to Stripe Portal.
 *
 * Database is the source of truth for all access state.
 */

import { useState, useEffect } from "react";
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Zap,
  Building2,
  Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillingStatus = {
  tier: "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
  subscription_status: string | null;
  current_period_end: string | null;
  has_stripe_customer: boolean;
  access_state: {
    can_scan: boolean;
    can_create_schedules: boolean;
    read_only: boolean;
    warning: string | null;
  };
};

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "STARTER" as const,
    name: "Starter",
    price: "Free",
    icon: Zap,
    color: "text-muted-foreground",
    features: [
      "1 company profile",
      "Manual scans only",
      "Basic reports",
      "Community support",
    ],
    cta: null, // Current plan or not purchasable
  },
  {
    id: "PROFESSIONAL" as const,
    name: "Professional",
    price: null, // From Stripe
    icon: Star,
    color: "text-primary",
    features: [
      "5 company profiles",
      "Scheduled automated monitoring",
      "Full AI perception reports",
      "Priority support",
    ],
    cta: "Upgrade to Professional",
  },
  {
    id: "ENTERPRISE" as const,
    name: "Enterprise",
    price: null,
    icon: Building2,
    color: "text-accent",
    features: [
      "Unlimited company profiles",
      "Unlimited scheduled scans",
      "Custom AI models",
      "Dedicated support",
    ],
    cta: "Upgrade to Enterprise",
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string | null) {
  if (!status)
    return <Badge variant="outline" className="text-muted-foreground">Free tier</Badge>;

  const map: Record<string, { label: string; className: string }> = {
    active:     { label: "Active",     className: "bg-green-50 text-green-700 border-green-200" },
    trialing:   { label: "Trialing",   className: "bg-blue-50 text-blue-700 border-blue-200" },
    past_due:   { label: "Past Due",   className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    canceled:   { label: "Canceled",   className: "bg-red-50 text-red-700 border-red-200" },
    incomplete: { label: "Incomplete", className: "bg-orange-50 text-orange-700 border-orange-200" },
    unpaid:     { label: "Unpaid",     className: "bg-red-50 text-red-700 border-red-200" },
  };
  const config = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [portaling, setPortaling] = useState(false);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setBilling(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async (plan: "PROFESSIONAL" | "ENTERPRISE") => {
    setUpgrading(plan);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast({
          title: "Checkout failed",
          description: data.error || "Could not start checkout. Please try again.",
          variant: "destructive",
        });
        return;
      }
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      toast({
        title: "Checkout failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setUpgrading(null);
    }
  };

  const handleManageBilling = async () => {
    setPortaling(true);
    try {
      const res = await fetch("/api/billing/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast({
          title: "Portal unavailable",
          description: data.error || "Could not open billing portal.",
          variant: "destructive",
        });
        return;
      }
      window.location.href = data.url;
    } catch {
      toast({
        title: "Portal unavailable",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setPortaling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentTier = billing?.tier ?? "STARTER";
  const warning = billing?.access_state.warning;

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-accent" />
            Billing & Subscription
          </h2>
          <p className="text-muted-foreground">
            Manage your plan, view subscription status, and upgrade your account.
          </p>
        </div>
      </div>

      {/* ── Warning banner ── */}
      {warning && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-800">{warning}</p>
        </div>
      )}

      {/* ── Success/cancel feedback from Stripe redirect ── */}
      {typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("success") === "1" && (
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <p className="text-sm text-green-800">
              Subscription activated! Your plan has been upgraded.
            </p>
          </div>
        )}

      {/* ── Current plan card ── */}
      <Card className="border shadow-sm">
        <CardHeader className="border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-primary">Current Plan</CardTitle>
              <CardDescription>
                {currentTier.charAt(0) + currentTier.slice(1).toLowerCase()} plan
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {statusBadge(billing?.subscription_status ?? null)}
              {billing?.has_stripe_customer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManageBilling}
                  disabled={portaling}
                >
                  {portaling ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Opening…</>
                  ) : (
                    "Manage Subscription"
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                Plan
              </div>
              <div className="font-bold text-primary text-base">
                {currentTier.charAt(0) + currentTier.slice(1).toLowerCase()}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                Status
              </div>
              <div className="font-medium text-primary capitalize">
                {billing?.subscription_status ?? "Free tier"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                {billing?.subscription_status === "canceled"
                  ? "Access Until"
                  : "Renews"}
              </div>
              <div className="font-medium text-primary">
                {formatDate(billing?.current_period_end ?? null)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Plan comparison / upgrade ── */}
      <div>
        <h3 className="text-base font-bold text-primary mb-4">
          {currentTier === "ENTERPRISE" ? "Your Plan Features" : "Upgrade Your Plan"}
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.id;
            const Icon = plan.icon;

            return (
              <Card
                key={plan.id}
                className={cn(
                  "border transition-all",
                  isCurrent && "ring-2 ring-primary shadow-md",
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("w-5 h-5", plan.color)} />
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {isCurrent && (
                      <Badge variant="outline" className="text-xs ml-auto">
                        Current
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {plan.cta && !isCurrent && currentTier !== "ENTERPRISE" && (
                    // Only show upgrade button if user is not already on a higher plan
                    (plan.id === "ENTERPRISE" || currentTier === "STARTER") && (
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={() => handleUpgrade(plan.id as "PROFESSIONAL" | "ENTERPRISE")}
                        disabled={upgrading === plan.id}
                      >
                        {upgrading === plan.id ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Redirecting…</>
                        ) : (
                          plan.cta
                        )}
                      </Button>
                    )
                  )}

                  {isCurrent && (
                    <div className="text-xs text-center text-muted-foreground font-medium py-1">
                      ✓ Your current plan
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Info footer ── */}
      <Card className="border-none bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Billing is managed securely through Stripe. VizAI does not store your payment
            information. Subscriptions renew automatically and can be canceled at any time
            from the billing portal. Canceled subscriptions retain access until the end of the
            billing period.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
