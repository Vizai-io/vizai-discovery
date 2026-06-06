"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Globe2,
  Loader2,
  Search,
  Shield,
  Star,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

const PLANS = [
  {
    id: "STARTER" as const,
    sku: null,
    name: "Free Visibility Scan",
    price: "$0",
    cadence: "Automated lead magnet",
    icon: Zap,
    color: "text-muted-foreground",
    features: [
      "AI visibility check",
      "Discovery, accuracy, authority scores",
      "High-level findings",
      "Immediate results",
    ],
    cta: null,
  },
  {
    id: "TIER0" as const,
    sku: "TIER0_SNAPSHOT",
    name: "Tier 0: Snapshot",
    price: "$495 CAD",
    cadence: "One-time, human-reviewed analysis",
    icon: Search,
    color: "text-primary",
    features: [
      "Lightweight canonical business profile",
      "Human-reviewed AI snapshot",
      "Confusion flags and source analysis",
      "VizAI Business Registry entry",
    ],
    cta: "Get Your Snapshot",
  },
  {
    id: "PROFESSIONAL" as const,
    sku: "TIER1_FOUNDATION",
    name: "Tier 1: Foundation",
    price: "$1,950 setup + $650/month",
    cadence: "Minimum 3 months",
    icon: Star,
    color: "text-primary",
    features: [
      "Verified Business Profile",
      "Canonical AI Business Model",
      "Baseline AI audit",
      "Monthly monitoring and reports",
    ],
    cta: "Build Your Foundation",
  },
  {
    id: "ENTERPRISE" as const,
    sku: "TIER2_REINFORCEMENT",
    name: "Tier 2: Reinforcement",
    price: "$3,750 setup + $2,250/month",
    cadence: "Minimum 3-6 months",
    icon: Building2,
    color: "text-accent",
    features: [
      "Everything in Tier 1",
      "Extended schema surfaces",
      "Bi-weekly monitoring",
      "Before/after verification snapshots",
    ],
    cta: "Reinforce Your Presence",
  },
  {
    id: "ENTERPRISE" as const,
    sku: "TIER3_GOVERNANCE",
    name: "Tier 3: Governance",
    price: "$5,950 setup + $4,950/month",
    cadence: "Minimum 6 months",
    icon: Shield,
    color: "text-accent",
    features: [
      "Everything in Tiers 1 and 2",
      "Authority-grade structured placements",
      "Managed corrections",
      "Executive reporting",
    ],
    cta: "Start Governance",
  },
] as const;

const ADDONS = [
  {
    sku: "ADDON_COMPETITOR_COMPARISON",
    name: "Competitor Comparison Report",
    price: "$750 CAD one-time",
    icon: Search,
    features: ["Top 3 competitors", "Gap identification", "Positioning recommendations"],
  },
  {
    sku: "ADDON_EXTENDED_QUERY_PACK",
    name: "Extended Query Pack",
    price: "$500 CAD one-time",
    icon: FileText,
    features: ["50 additional queries", "Industry-specific questions", "Geographic variations"],
  },
  {
    sku: "ADDON_QUARTERLY_DEEP_AUDIT",
    name: "Quarterly Deep Audit",
    price: "$950 CAD per quarter",
    icon: Star,
    features: ["Full baseline re-run", "Trend analysis", "Strategy recommendations"],
  },
  {
    sku: "ADDON_CONTENT_OPTIMIZATION_PAGE",
    name: "Content Optimization",
    price: "$1,200 CAD per page",
    icon: FileText,
    features: ["About page restructure", "Service descriptions", "FAQ creation"],
  },
  {
    sku: "ADDON_MULTI_LANGUAGE_TESTING",
    name: "Multi-Language Testing",
    price: "$600 CAD per language",
    icon: Globe2,
    features: ["Localized recommendations", "Cross-language consistency", "Additional languages"],
  },
  {
    sku: "ADDON_PRIORITY_SUPPORT",
    name: "Priority Support",
    price: "$250 CAD/month",
    icon: Zap,
    features: ["4-hour response guarantee", "Direct phone/video support", "Emergency drift alerts"],
  },
] as const;

function statusBadge(status: string | null) {
  if (!status) {
    return <Badge variant="outline" className="text-muted-foreground">Free tier</Badge>;
  }

  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-green-50 text-green-700 border-green-200" },
    trialing: { label: "Trialing", className: "bg-blue-50 text-blue-700 border-blue-200" },
    past_due: { label: "Past Due", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    canceled: { label: "Canceled", className: "bg-red-50 text-red-700 border-red-200" },
    incomplete: { label: "Incomplete", className: "bg-orange-50 text-orange-700 border-orange-200" },
    unpaid: { label: "Unpaid", className: "bg-red-50 text-red-700 border-red-200" },
  };
  const config = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function displayTier(tier: BillingStatus["tier"]): string {
  if (tier === "PROFESSIONAL") return "Tier 1 Foundation";
  if (tier === "ENTERPRISE") return "Tier 2/3";
  return "Free";
}

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

  const handleCheckout = async (sku: string) => {
    setUpgrading(sku);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
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
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-accent" />
            Billing & Subscription
          </h2>
          <p className="text-muted-foreground">
            Upgrade your AI visibility program or purchase specialized service add-ons.
          </p>
        </div>
      </div>

      {warning && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-800">{warning}</p>
        </div>
      )}

      {typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("success") === "1" && (
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <p className="text-sm text-green-800">
              Checkout complete. Your billing status will update after Stripe confirms the payment.
            </p>
          </div>
        )}

      <Card className="border shadow-sm">
        <CardHeader className="border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-primary">Current Platform Access</CardTitle>
              <CardDescription>{displayTier(currentTier)}</CardDescription>
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
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Opening...</>
                  ) : (
                    "Manage Billing"
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
                Access
              </div>
              <div className="font-bold text-primary text-base">{displayTier(currentTier)}</div>
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
                {billing?.subscription_status === "canceled" ? "Access Until" : "Renews"}
              </div>
              <div className="font-medium text-primary">
                {formatDate(billing?.current_period_end ?? null)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-base font-bold text-primary mb-4">
          Choose Your Level of AI Visibility Control
        </h3>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.id;
            const Icon = plan.icon;

            return (
              <Card
                key={`${plan.id}-${plan.name}`}
                className={cn("border transition-all", isCurrent && "ring-2 ring-primary shadow-md")}
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
                  <CardDescription>
                    <span className="block font-bold text-primary">{plan.price}</span>
                    <span>{plan.cadence}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {plan.cta && plan.sku && (
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => handleCheckout(plan.sku)}
                      disabled={upgrading === plan.sku}
                    >
                      {upgrading === plan.sku ? (
                        <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Redirecting...</>
                      ) : (
                        plan.cta
                      )}
                    </Button>
                  )}

                  {isCurrent && (
                    <div className="text-xs text-center text-muted-foreground font-medium py-1">
                      Your current access level
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-base font-bold text-primary mb-4">Service Add-Ons</h3>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ADDONS.map((addon) => {
            const Icon = addon.icon;
            return (
              <Card key={addon.sku} className="border transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-5 h-5 text-primary" />
                    <CardTitle className="text-base">{addon.name}</CardTitle>
                  </div>
                  <CardDescription>
                    <span className="font-bold text-primary">{addon.price}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {addon.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    size="sm"
                    variant="outline"
                    onClick={() => handleCheckout(addon.sku)}
                    disabled={upgrading === addon.sku}
                  >
                    {upgrading === addon.sku ? (
                      <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Redirecting...</>
                    ) : (
                      "Purchase Add-On"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="border-none bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Billing is managed securely through Stripe. VizAI does not store your payment
            information. Setup fees and one-time add-ons are charged at checkout. Subscription
            services renew automatically and can be managed from the billing portal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
