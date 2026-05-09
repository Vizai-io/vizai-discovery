/**
 * @fileOverview Admin Intelligence Validator — Sprint 4 stub.
 *
 * Previously wrote test scans directly to Firestore `scans` collection.
 * Now: POSTs to POST /api/scan (Postgres) instead.
 *
 * Stabilization note: Firestore integrity check (getDoc verify) is removed.
 * The POST /api/scan response includes the created scanId for navigation.
 */

"use client";

import { useState } from "react";
import { ScanEngine } from "@/lib/services/scan-engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Loader2,
  CheckCircle2,
  ExternalLink,
  ChevronLeft,
  FileSearch,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";

export default function AdminScanTestPage() {
  const [loading, setLoading] = useState(false);
  const [createdScanId, setCreatedScanId] = useState<string | null>(null);

  const handleCreateTestScan = async () => {
    setLoading(true);
    setCreatedScanId(null);

    try {
      const res = await fetch('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName:     'Test Diagnostic Corp',
          website:         'https://test.vizai.ai',
          industry:        'logistics',
          targetGeography: 'Diagnostic Sandbox',
          organizationId:  'org_admin_test',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `API error ${res.status}`);

      setCreatedScanId(data.scanId ?? data.id ?? null);
      toast({ title: 'Test Scan Created', description: `ID: ${data.scanId ?? data.id}` });
    } catch (error: any) {
      console.error('Test Creation Failed:', error);
      toast({ title: 'Scan Failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="icon" className="rounded-full"><ChevronLeft className="w-5 h-5" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-black text-primary tracking-tight">Intelligence Validator</h1>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Diagnostic Tool • Path: /admin/scan-test</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Admin Only</Badge>
        </header>

        <Card className="border-none shadow-xl bg-white overflow-hidden">
          <CardHeader className="bg-primary/5 border-b py-6 px-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Direct Scan Injector</CardTitle>
                <CardDescription className="text-xs">Runs a test scan via POST /api/scan → Postgres (no Firestore).</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="p-4 bg-muted/30 rounded-2xl border border-dashed text-sm space-y-2">
              <p className="font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" /> Operational Warning</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Clicking the button below will create a new <strong>PerceptionScan</strong> in Postgres.
                This record is used to validate that the frontend can correctly fetch and render deep-nested intelligence objects.
              </p>
            </div>

            <Button
              onClick={handleCreateTestScan}
              disabled={loading}
              className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white gap-2 shadow-xl rounded-xl"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Inject Sample Completed Audit'}
            </Button>

            {createdScanId && (
              <div className="pt-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="p-6 bg-green-50 border border-green-100 rounded-3xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-700 font-bold">
                      <CheckCircle2 className="w-5 h-5" /> Write Successful (Postgres)
                    </div>
                    <code className="text-[10px] bg-white px-2 py-1 rounded border font-mono">{createdScanId}</code>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link href={`/scans/results/${createdScanId}`} target="_blank">
                      <Button variant="outline" className="w-full bg-white gap-2 h-10">
                        View Analytics Dashboard <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href={`/scans/results/${createdScanId}`} target="_blank">
                      <Button variant="outline" className="w-full bg-white gap-2 h-10">
                        View Professional Report <FileSearch className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center pt-8">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">VizAI Intelligence System Diagnostic v2.0 — Postgres Runtime</p>
        </div>
      </div>
    </div>
  );
}
