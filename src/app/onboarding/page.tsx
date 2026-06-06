"use client";

/**
 * @fileOverview /onboarding — Self-serve org setup for new users.
 *
 * Shown when a user's organizationId === "unassigned".
 * Collects org name, business name, and optional website URL,
 * then calls POST /api/onboarding to atomically create the org,
 * assign the user, and create the first company profile.
 *
 * On success, redirects to /companies.
 * On 409 (already assigned), redirects to /companies immediately.
 */

import { Suspense, useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orgName, setOrgName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromFreeScan = searchParams.get("ref") === "free-scan";

  useEffect(() => {
    const bn = searchParams.get("businessName");
    const ws = searchParams.get("website");
    if (bn && !businessName) {
      setBusinessName(bn);
      setOrgName(bn);
    }
    if (ws && !websiteUrl) setWebsiteUrl(ws);
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!orgName.trim()) {
      setError("Organization name is required.");
      return;
    }
    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName.trim(),
          business_name: businessName.trim(),
          website_url: websiteUrl.trim() || undefined,
        }),
      });

      if (res.status === 409) {
        // Already assigned — just continue
        router.replace("/companies");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Setup failed. Please try again.");
        return;
      }

      router.replace("/companies");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="bg-primary p-2 rounded-lg">
          <Search className="w-6 h-6 text-white" />
        </div>
        <span className="text-2xl font-headline font-bold text-primary">VizAI</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-headline">Set up your account</CardTitle>
          <CardDescription>
            {fromFreeScan
              ? "Your free scan is ready. Set up your account to unlock full AI perception intelligence."
              : "Create your organization and add your first company profile to get started."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Organization name */}
            <div className="space-y-1.5">
              <Label htmlFor="org_name">Organization name <span className="text-destructive">*</span></Label>
              <Input
                id="org_name"
                placeholder="e.g. Acme Corp"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={submitting}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Your team or company account name. Used internally.
              </p>
            </div>

            {/* Business name */}
            <div className="space-y-1.5">
              <Label htmlFor="business_name">Business name <span className="text-destructive">*</span></Label>
              <Input
                id="business_name"
                placeholder="e.g. Acme Corp"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                The name of your first company profile (how AI models know you).
              </p>
            </div>

            {/* Website URL */}
            <div className="space-y-1.5">
              <Label htmlFor="website_url">Website URL <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input
                id="website_url"
                type="url"
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Setting up your account…
                </>
              ) : (
                "Get started"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        You&apos;ll be on the Starter plan. Contact support to upgrade.
      </p>
    </div>
  );
}
