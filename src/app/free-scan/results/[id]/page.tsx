/**
 * @fileOverview /free-scan/results/[id] — Free scan teaser page.
 *
 * STATUS: MIGRATED (Sprint 3 Task 1) — Firestore eliminated.
 *
 * Reads the scan directly from Postgres (free-scan org only) — no HTTP
 * self-fetch. The previous implementation fetched its own API via
 * NEXT_PUBLIC_APP_URL, which 404'd the whole funnel whenever that env var
 * didn't match the serving origin (e.g. local dev on a non-default port).
 * GET /api/free-scan/[id] remains the public API surface; this page and that
 * route share the same query shape.
 *
 * This page is an AI discoverability surface (Refinement 6):
 * - Public, indexable
 * - Serves as the bottom-of-funnel CTA page for the free scan acquisition flow
 * - Crawler-visible score creates discoverability artifacts
 *
 * Lifecycle:
 *   free-scan submit → results (this page, teaser) → register CTA → onboarding → dashboard
 *
 * The register CTA carries ref/scanId/businessName/website params so the
 * onboarding step can pre-fill and claim the scan into the new org.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Lock, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

// ── Data fetch (direct Postgres read, deduped across metadata + page) ────────

const getFreeScanResult = cache(async (id: string) => {
  try {
    const scan = await db.perceptionScan.findFirst({
      where: { id, organizationId: "free-scan" },
      select: {
        id:     true,
        status: true,
        companyProfile: {
          select: { businessName: true, websiteUrl: true },
        },
        scanReport: {
          select: { jsonReport: true },
        },
      },
    });

    if (!scan) return null;

    const jsonReport = scan.scanReport?.jsonReport as any;
    // Platform mock scans store overallScore at the top level; lmo-backend
    // intake scans store it under scores.overall.
    const overallScore: number | null =
      jsonReport?.overallScore ?? jsonReport?.scores?.overall ?? null;
    // Query-based customer-intent scan (honest, web-grounded score), when present.
    const customerIntent = (jsonReport as any)?.customerIntent ?? null;

    return {
      scanId:       scan.id,
      status:       scan.status,
      businessName: scan.companyProfile?.businessName ?? null,
      websiteUrl:   scan.companyProfile?.websiteUrl ?? null,
      overallScore,
      customerIntent,
    };
  } catch {
    return null;
  }
});

// ── Metadata (Refinement 6: SEO + OG for discoverability) ────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const data = await getFreeScanResult(id);
  const businessName: string = data?.businessName ?? "Your Business";
  const score: string = data?.overallScore != null ? data.overallScore.toFixed(1) : "—";

  return {
    title: `AI Visibility Audit — ${businessName} | VizAI`,
    description: `Free AI Visibility Audit for ${businessName}. Score: ${score}/100. Discover how AI models perceive your brand and unlock full strategic recommendations.`,
    openGraph: {
      title: `AI Visibility Score: ${score} — ${businessName}`,
      description: `See how AI systems currently recommend ${businessName}. Powered by VizAI Discovery Intelligence.`,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

// ── Page component ────────────────────────────────────────────────────────────

export default async function FreeScanTeaserPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getFreeScanResult(id);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-2xl font-bold">Audit Not Found</h2>
        <p className="text-muted-foreground">The requested record is invalid or has expired.</p>
        <Link href="/free-scan"><Button>New Scan</Button></Link>
      </div>
    );
  }

  // If somehow still processing, redirect back and let the user retry
  if (data.status === "RUNNING" || data.status === "PENDING") {
    redirect("/free-scan");
  }

  if (data.status === "FAILED") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-2xl font-bold">Scan Failed</h2>
        <p className="text-muted-foreground">We could not complete your audit. Please try again.</p>
        <Link href="/free-scan"><Button>Try Again</Button></Link>
      </div>
    );
  }

  const businessName: string = data.businessName ?? "Your Business";
  const overallScore: number = data.overallScore ?? 0;
  // Honest score from the query-based customer-intent scan, when present.
  const ci = (data as any).customerIntent as {
    overall_score?: number;
    found_score?: number;
    recommended_score?: number;
    top_gaps?: string[];
    summary?: string;
    discovery?: {
      score?: number;
      found_score?: number;
      recommended_score?: number;
      recommended_instead?: string[];
    };
    direct?: {
      summary?: string;
      services?: string[];
      contact?: { website?: string; phone?: string; email?: string };
      locations?: string[];
    };
  } | null;
  // Blind-search score is the headline (new two-view structure); fall back
  // to the flat overall_score from scans stored before the change.
  const displayScore: number = ci?.discovery?.score ?? ci?.overall_score ?? overallScore;
  const discFound: number = ci?.discovery?.found_score ?? ci?.found_score ?? 0;
  const discRecommended: number =
    ci?.discovery?.recommended_score ?? ci?.recommended_score ?? 0;

  // Register CTA carries the scan context so onboarding can pre-fill and
  // claim this scan into the newly created organization.
  const registerParams = new URLSearchParams({ ref: "free-scan", scanId: data.scanId });
  if (data.businessName) registerParams.set("businessName", data.businessName);
  if (data.websiteUrl) registerParams.set("website", data.websiteUrl);
  const registerHref = `/auth/register?${registerParams.toString()}`;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="px-6 py-4 flex items-center justify-between border-b bg-white">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg"><Search className="w-5 h-5 text-white" /></div>
          <span className="text-xl font-headline font-bold text-primary">VizAI</span>
        </Link>
        <Link href="/auth/sign-in"><Button variant="ghost">Sign In</Button></Link>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6 space-y-8 animate-in fade-in duration-700">
        {/* DEV diagnostic */}
        {process.env.NODE_ENV === "development" && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[10px] font-mono font-bold flex justify-between items-center text-amber-900 uppercase">
            <div className="flex gap-4">
              <span>Scan ID: {id}</span>
              <span className="text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Postgres — free-scan org
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b pb-8">
          <div className="space-y-1">
            <Badge className="bg-accent text-primary font-black uppercase tracking-[0.2em] mb-2 px-3 py-1">
              Limited Preview Audit
            </Badge>
            <h2 className="text-4xl font-headline font-black text-primary tracking-tighter">AI Visibility Index</h2>
            <p className="text-muted-foreground">
              Subject: <strong className="text-primary">{businessName}</strong>
            </p>
          </div>
          <div className="p-6 bg-primary text-white rounded-[2rem] shadow-xl text-center min-w-[140px]">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Visibility Score</div>
            <div className="text-5xl font-black">{displayScore.toFixed(1)}</div>
          </div>
        </div>

        {/* Customer-intent score (honest, web-grounded) - shown, not locked */}
        {ci && (
          <div className="space-y-6">
            {/* Blind search: the score */}
            <div>
              <h3 className="text-lg font-black text-primary tracking-tight mb-3">Blind search - what AI finds when customers ask for your service</h3>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Found</div>
                  <div className="text-3xl font-black text-primary">{discFound}</div>
                  <div className="text-xs text-muted-foreground">of customer questions mention you</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recommended</div>
                  <div className="text-3xl font-black text-primary">{discRecommended}</div>
                  <div className="text-xs text-muted-foreground">of questions recommend you</div>
                </Card>
              </div>
            </div>
            {ci.top_gaps && ci.top_gaps.length > 0 && (
              <Card className="p-6 space-y-3">
                <h3 className="text-lg font-black text-primary tracking-tight">Where AI is sending your customers instead</h3>
                <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                  {ci.top_gaps.slice(0, 4).map((gap: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-destructive font-bold">•</span>
                      <span>{gap}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm leading-relaxed">
                  This is what the scan found by asking the AI the questions your customers actually ask. The full per-question breakdown and the fix are inside the full audit.
                </p>
              </Card>
            )}
            {/* Direct search: summary + short details list (not a score) */}
            {ci.direct && (
              <Card className="p-6 space-y-4">
                <h3 className="text-lg font-black text-primary tracking-tight">Direct search - what AI says about {businessName}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{ci.direct.summary}</p>
                <p className="text-xs text-muted-foreground">
                  There is no truth file yet, so this is what the AI found - you decide what is true and what is not.
                </p>
                <ul className="space-y-2 text-sm leading-relaxed">
                  {ci.direct.services && ci.direct.services.length > 0 && (
                    <li><span className="font-semibold">Services:</span> {ci.direct.services.join(", ")}</li>
                  )}
                  {ci.direct.contact?.website && (
                    <li><span className="font-semibold">Website:</span> {ci.direct.contact.website}</li>
                  )}
                  {ci.direct.contact?.phone && (
                    <li><span className="font-semibold">Phone:</span> {ci.direct.contact.phone}</li>
                  )}
                  {ci.direct.contact?.email && (
                    <li><span className="font-semibold">Email:</span> {ci.direct.contact.email}</li>
                  )}
                  {ci.direct.locations && ci.direct.locations.length > 0 && (
                    <li><span className="font-semibold">Locations:</span> {ci.direct.locations.join(", ")}</li>
                  )}
                </ul>
              </Card>
            )}
          </div>
        )}


        {/* Locked content overlay */}
        <div className="relative">
          <div className="absolute inset-0 bg-white/60 backdrop-blur-md z-10 flex flex-col items-center justify-center text-center p-8 space-y-6 rounded-[2rem] border shadow-inner">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2 max-w-sm">
              <h4 className="text-2xl font-black text-primary tracking-tight">Unlock Full Intelligence Audit</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The teaser provides a minimal baseline. Sign in to access full narrative analysis,
                competitor deep-dives, and strategic implementation plans.
              </p>
            </div>
            <Link href={registerHref} className="w-full max-w-xs">
              <Button className="w-full h-14 bg-primary text-white font-black text-lg gap-2 shadow-2xl rounded-full">
                <Sparkles className="w-5 h-5 text-accent" /> Create Account for Full Access
              </Button>
            </Link>
          </div>

          <div className="space-y-6 blur-sm pointer-events-none select-none">
            <div className="grid grid-cols-2 gap-4">
              <Card className="h-40 bg-slate-50 border-none" />
              <Card className="h-40 bg-slate-50 border-none" />
            </div>
            <Card className="h-64 bg-slate-50 border-none" />
          </div>
        </div>
      </main>
    </div>
  );
}
