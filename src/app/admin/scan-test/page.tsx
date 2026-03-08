"use client";

import { useState } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
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
  Database,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";

export default function AdminScanTestPage() {
  const [loading, setLoading] = useState(false);
  const [createdScanId, setCreatedScanId] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<{ results: boolean; queries: boolean } | null>(null);

  const handleCreateTestScan = async () => {
    setLoading(true);
    setCreatedScanId(null);
    setIntegrity(null);

    try {
      // 1. Setup Mock Input
      const testInput = {
        companyName: "Test Diagnostic Corp",
        website: "https://test.vizai.ai",
        industry: "logistics",
        targetGeography: "Diagnostic Sandbox",
        organizationId: "org_admin_test"
      };

      // 2. Run Minimal Engine
      const results = await ScanEngine.runScan(testInput);

      // 3. Persist to Firestore
      const scanRef = await addDoc(collection(db, "scans"), {
        ...testInput,
        date: serverTimestamp(),
        status: "completed",
        reviewStatus: "draft",
        results: results,
        queryDiscovery: results.queryDiscovery,
        isTest: true
      });

      const scanId = scanRef.id;
      setCreatedScanId(scanId);

      // 4. Verify Integrity (Passive Check)
      const verifySnap = await getDoc(doc(db, "scans", scanId));
      if (verifySnap.exists()) {
        const data = verifySnap.data();
        setIntegrity({
          results: !!data.results,
          queries: !!data.queryDiscovery
        });
      }

      toast({ title: "Test Scan Created", description: `ID: ${scanId}` });
    } catch (error: any) {
      console.error("Test Creation Failed:", error);
      toast({ title: "Write Failed", description: error.message, variant: "destructive" });
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
                <CardTitle className="text-lg">Direct Document Injector</CardTitle>
                <CardDescription className="text-xs">Bypasses all client-side logic to write a completed audit directly to Firestore.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="p-4 bg-muted/30 rounded-2xl border border-dashed text-sm space-y-2">
              <p className="font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" /> Operational Warning</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Clicking the button below will create a new <strong>ScanRecord</strong> in your production database. This record is used to validate that the frontend can correctly fetch and render deep-nested intelligence objects.
              </p>
            </div>

            <Button 
              onClick={handleCreateTestScan} 
              disabled={loading}
              className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white gap-2 shadow-xl rounded-xl"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Inject Sample Completed Audit"}
            </Button>

            {createdScanId && (
              <div className="pt-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="p-6 bg-green-50 border border-green-100 rounded-3xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-700 font-bold">
                      <CheckCircle2 className="w-5 h-5" /> Write Successful
                    </div>
                    <code className="text-[10px] bg-white px-2 py-1 rounded border font-mono">{createdScanId}</code>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-2xl border flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground">ScanResults</span>
                      {integrity?.results ? <Badge className="bg-green-100 text-green-700">PERSISTED</Badge> : <Badge variant="destructive">MISSING</Badge>}
                    </div>
                    <div className="bg-white p-4 rounded-2xl border flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground">QueryData</span>
                      {integrity?.queries ? <Badge className="bg-green-100 text-green-700">PERSISTED</Badge> : <Badge variant="destructive">MISSING</Badge>}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Link href={`/scans/${createdScanId}`} target="_blank">
                      <Button variant="outline" className="w-full bg-white gap-2 h-10">
                        View Analytics Dashboard <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href={`/scans/${createdScanId}/report`} target="_blank">
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
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">VizAI Intelligence System Diagnostic v1.4</p>
        </div>
      </div>
    </div>
  );
}
