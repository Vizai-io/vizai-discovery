
"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Lock, 
  Sparkles, 
  Eye, 
  ShieldCheck, 
  Loader2,
  AlertCircle,
  RefreshCcw,
  Zap,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function FreeScanTeaserPage({ params }: { params: { id: string } }) {
  const [scan, setScan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "scans", params.id), (docSnap) => {
      if (docSnap.exists()) {
        setScan({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Synchronizing Audit Trail...</p>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-2xl font-bold">Audit Identifier Not Found</h2>
        <p className="text-muted-foreground">The requested record is invalid or has expired.</p>
        <Link href="/free-scan"><Button>New Scan</Button></Link>
      </div>
    );
  }

  if (scan.status === 'running') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-6">
        <RefreshCcw className="w-16 h-16 text-primary animate-spin opacity-20" />
        <div className="text-center space-y-4 max-w-sm">
          <h3 className="text-2xl font-black text-primary">Audit in Progress</h3>
          <p className="text-muted-foreground text-sm">Validating brand signals against minimal deterministic layer...</p>
        </div>
      </div>
    );
  }

  const results = scan.results || { overallScore: 0 };

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
        {/* Diagnostic Debug Panel */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[10px] font-mono font-bold flex justify-between items-center text-amber-900 uppercase">
            <div className="flex gap-4">
              <span>Path: scans/{scan.id}</span>
              <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Result Data Detected</span>
            </div>
            <Button size="xs" variant="ghost" className="h-6 text-[9px]" onClick={() => window.location.reload()}>Re-Fetch</Button>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b pb-8">
          <div className="space-y-1">
            <Badge className="bg-accent text-primary font-black uppercase tracking-[0.2em] mb-2 px-3 py-1">Limited Preview Audit</Badge>
            <h2 className="text-4xl font-headline font-black text-primary tracking-tighter">AI Visibility Index</h2>
            <p className="text-muted-foreground">Subject: <strong className="text-primary">{scan.companyName}</strong> • {scan.industry}</p>
          </div>
          <div className="p-6 bg-primary text-white rounded-[2rem] shadow-xl text-center min-w-[140px]">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Visibility Score</div>
            <div className="text-5xl font-black">{results.overallScore?.toFixed(1) || "0.0"}</div>
          </div>
        </div>

        {/* Locked Content Overlay */}
        <div className="relative">
          <div className="absolute inset-0 bg-white/60 backdrop-blur-md z-10 flex flex-col items-center justify-center text-center p-8 space-y-6 rounded-[2rem] border shadow-inner">
             <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20"><Lock className="w-8 h-8" /></div>
             <div className="space-y-2 max-w-sm">
               <h4 className="text-2xl font-black text-primary tracking-tight">Unlock Full Intelligence Audit</h4>
               <p className="text-sm text-muted-foreground leading-relaxed">The teaser provides a minimal baseline. Sign in to access full narrative analysis, competitor deep-dives, and strategic implementation plans.</p>
             </div>
             <Link href="/auth/sign-in" className="w-full max-w-xs"><Button className="w-full h-14 bg-primary text-white font-black text-lg gap-2 shadow-2xl rounded-full"><Sparkles className="w-5 h-5 text-accent" /> Create Account for Full Access</Button></Link>
          </div>

          <div className="space-y-6 blur-sm pointer-events-none select-none">
             <div className="grid grid-cols-2 gap-4"><Card className="h-40 bg-slate-50 border-none" /><Card className="h-40 bg-slate-50 border-none" /></div>
             <Card className="h-64 bg-slate-50 border-none" />
          </div>
        </div>
      </main>
    </div>
  );
}
