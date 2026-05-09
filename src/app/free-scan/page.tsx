"use client";

/**
 * @fileOverview Free Scan submission page.
 *
 * STATUS: MIGRATED (Sprint 3 Task 1) — Firestore eliminated.
 *
 * Public lifecycle (Refinement C):
 *   visitor
 *   → /free-scan (this page — form submit)
 *   → POST /api/free-scan (rate check → ScanEngine → Postgres persist)
 *   → /free-scan/results/[id] (teaser view, locked content)
 *   → /auth/register (CTA → create account)
 *   → /onboarding (org assignment)
 *   → /dashboard (authenticated lifecycle)
 *
 * Share path:
 *   GET /api/share/[id] (public read, free-scan org only)
 *
 * No Firebase imports. No Firestore writes.
 * Rate limiting is enforced server-side in /api/free-scan.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Zap,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";

export default function FreeScanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName:     "",
    website:         "",
    industry:        "logistics",
    targetGeography: "",
    email:           "",
  });
  // Honeypot — hidden from users, bots fill it in
  const [hp, setHp] = useState("");

  const handleRunFreeScan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.companyName || !formData.website || !formData.industry || !formData.email || !formData.targetGeography) {
      toast({ title: "Validation Error", description: "All fields are required.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/free-scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName:     formData.companyName,
          website:         formData.website,
          industry:        formData.industry,
          targetGeography: formData.targetGeography,
          email:           formData.email,
          honeypot:        hp,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          toast({ title: "Scan Restricted", description: data.error, variant: "destructive" });
        } else {
          toast({ title: "Scan Failed", description: data.error ?? "Failed to generate free audit.", variant: "destructive" });
        }
        return;
      }

      toast({ title: "Scan Ready", description: "Your free audit is complete." });
      router.push(`/free-scan/results/${data.scanId}`);
    } catch (error: any) {
      console.error("Free scan submission error:", error);
      toast({ title: "Scan Failed", description: error?.message ?? "Failed to generate free audit.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b bg-white">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg"><Search className="w-5 h-5 text-white" /></div>
          <span className="text-xl font-headline font-bold text-primary">VizAI</span>
        </Link>
        <Link href="/auth/sign-in"><Button variant="ghost">Sign In</Button></Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-headline font-bold text-primary tracking-tight">Free AI Visibility Audit</h1>
          <p className="text-muted-foreground text-lg">Discover how AI systems currently recommend your brand in 60 seconds.</p>
        </div>

        <Card className="w-full border-none shadow-2xl bg-white overflow-hidden">
          <CardHeader className="bg-primary/5 border-b py-6 px-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white"><Zap className="w-5 h-5" /></div>
              <div>
                <CardTitle className="text-lg">Intelligence Input</CardTitle>
                <CardDescription className="text-xs">Provide baseline parameters for your audit.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handleRunFreeScan} className="space-y-6">
              {/* Honeypot — hidden from users */}
              <div className="hidden" aria-hidden="true">
                <input type="text" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Business Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    placeholder="Acme Corp"
                    required
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website URL</Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://acme.ai"
                    required
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry Vertical</Label>
                <Select value={formData.industry} onValueChange={(val) => setFormData({ ...formData, industry: val })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select Industry" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logistics">Logistics &amp; Supply Chain</SelectItem>
                    <SelectItem value="warehousing">Industrial Warehousing</SelectItem>
                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="legal">Corporate Legal Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="geography">Primary Location / Target Market</Label>
                <Input
                  id="geography"
                  placeholder="e.g. North America, Global"
                  required
                  value={formData.targetGeography}
                  onChange={(e) => setFormData({ ...formData, targetGeography: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-14 text-lg bg-primary hover:bg-primary/90 text-white font-bold gap-2 shadow-xl"
                disabled={loading}
              >
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Auditing...</>
                  : <>Run Discovery Scan <ChevronRight className="w-5 h-5" /></>
                }
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
