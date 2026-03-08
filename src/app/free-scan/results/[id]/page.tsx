
"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { ScoreCard } from "@/components/dashboard/score-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Lock, 
  Sparkles, 
  ChevronRight, 
  Eye, 
  ShieldCheck, 
  Target, 
  Users,
  Loader2,
  AlertCircle,
  TrendingUp,
  FileText
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function FreeScanTeaserPage({ params }: { params: { id: string } }) {
  const [scan, setScan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
      try {
        const docSnap = await getDoc(doc(db, "scans", params.id));
        if (docSnap.exists()) {
          setScan(docSnap.data());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Reconstructing limited intelligence graph...</p>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-2xl font-bold">Scan Not Found</h2>
        <p className="text-muted-foreground">The requested audit identifier is invalid or expired.</p>
        <Link href="/free-scan"><Button>Run New Scan</Button></Link>
      </div>
    );
  }

  const results = scan.results;
  const firstQuery = scan.queryDiscovery?.queries[0];

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="px-6 py-4 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <Search className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-headline font-bold text-primary">VizAI</span>
        </Link>
        <Link href="/login">
          <Button variant="ghost">Sign In</Button>
        </Link>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6 space-y-8 animate-in fade-in duration-700">
        {/* Teaser Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b pb-8">
          <div className="space-y-1">
            <Badge className="bg-accent text-primary font-black uppercase tracking-[0.2em] mb-2 border-none px-3 py-1">Teaser Audit Results</Badge>
            <h2 className="text-4xl font-headline font-black text-primary tracking-tighter">AI Visibility Index</h2>
            <p className="text-muted-foreground font-medium">Subject: <strong className="text-primary">{scan.companyName}</strong> • {scan.industry} • Limited Preview</p>
          </div>
          <div className="p-6 bg-primary text-white rounded-[2rem] shadow-xl text-center min-w-[140px] border border-primary/20">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Visibility Score</div>
            <div className="text-5xl font-black">{results.overallScore.toFixed(1)}</div>
          </div>
        </div>

        {/* Discovery Sample */}
        <div className="space-y-4">
           <h3 className="text-lg font-bold text-primary flex items-center gap-2">
             <Eye className="w-5 h-5 text-accent" />
             Discovery Signal Sample
           </h3>
           {firstQuery ? (
             <Card className="border-none shadow-sm bg-white overflow-hidden">
               <CardHeader className="bg-muted/30 py-4 border-b">
                 <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Simulated User Intent</div>
                 <div className="text-sm font-bold text-primary italic">"{firstQuery.text}"</div>
               </CardHeader>
               <CardContent className="p-6 space-y-4">
                 <div className="flex items-center gap-3">
                   <div className={cn(
                     "w-10 h-10 rounded-xl flex items-center justify-center text-white",
                     firstQuery.results.some((r: any) => r.isTargetCompanyMentioned) ? "bg-green-500" : "bg-red-400"
                   )}>
                     {firstQuery.results.some((r: any) => r.isTargetCompanyMentioned) ? <ShieldCheck className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                   </div>
                   <div>
                     <div className="text-xs font-bold text-primary">
                        {firstQuery.results.some((r: any) => r.isTargetCompanyMentioned) ? "Brand Signal Detected" : "Discovery Signal Gap"}
                     </div>
                     <p className="text-[10px] text-muted-foreground">This intent vector was tested against 4 major AI providers.</p>
                   </div>
                 </div>
               </CardContent>
             </Card>
           ) : (
             <p className="text-sm text-muted-foreground italic">Sample discovery vectors not available for this audit.</p>
           )}
        </div>

        {/* Locked Content Overlay */}
        <div className="relative group">
          <div className="absolute inset-0 bg-white/60 backdrop-blur-md z-10 flex flex-col items-center justify-center text-center p-8 space-y-6">
             <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
               <Lock className="w-8 h-8" />
             </div>
             <div className="space-y-2 max-w-sm">
               <h4 className="text-2xl font-black text-primary tracking-tight">Unlock Full Intelligence Report</h4>
               <p className="text-sm text-muted-foreground leading-relaxed">
                 The teaser only shows 5% of our 24-vector audit. Create an account to see competitor deep-dives, narrative accuracy scores, and strategic uplift projections.
               </p>
             </div>
             <Link href="/login" className="w-full max-w-xs">
               <Button className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black text-lg gap-2 shadow-2xl shadow-primary/30 rounded-full">
                 <Sparkles className="w-5 h-5 text-accent" /> Unlock Full Report
               </Button>
             </Link>
             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Free account setup • Instant Access</p>
          </div>

          {/* Blurred Dummy Content */}
          <div className="space-y-6 blur-sm pointer-events-none select-none">
             <div className="grid grid-cols-2 gap-4">
                <Card className="h-40 bg-slate-50 border-none" />
                <Card className="h-40 bg-slate-50 border-none" />
             </div>
             <Card className="h-64 bg-slate-50 border-none" />
          </div>
        </div>

        {/* Footer Teaser */}
        <div className="grid md:grid-cols-3 gap-6 pt-12">
          <div className="p-6 bg-white rounded-2xl shadow-sm space-y-3">
             <TrendingUp className="w-6 h-6 text-accent" />
             <h5 className="font-bold text-primary">Competitive Benchmarking</h5>
             <p className="text-xs text-muted-foreground">Compare your score against 450+ industry rivals in the global knowledge graph.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl shadow-sm space-y-3">
             <Target className="w-6 h-6 text-accent" />
             <h5 className="font-bold text-primary">Optimization Scenario</h5>
             <p className="text-xs text-muted-foreground">Projected Visibility gain after deploying entity-signal technical markup.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl shadow-sm space-y-3">
             <FileText className="w-6 h-6 text-accent" />
             <h5 className="font-bold text-primary">Narrative Alignment</h5>
             <p className="text-xs text-muted-foreground">Check how accurately ChatGPT and Gemini summarize your corporate services.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
