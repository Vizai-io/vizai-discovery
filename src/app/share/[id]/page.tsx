
"use client";

import { useState, useEffect, useMemo } from "react";
import { doc, getDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/config";
import { ScanRecord, StrategicRecommendation } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShieldCheck, 
  Target, 
  Search, 
  Zap, 
  Users,
  FileText,
  Globe,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Lock,
  SearchCode
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function PublicSharePage({ params }: { params: { id: string } }) {
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSharedScan() {
      try {
        const docRef = doc(db, "scans", params.id);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
          setError("Report not found.");
          return;
        }

        const data = docSnap.data() as ScanRecord;

        // Security: Only allow shared & approved scans
        if (!data.shareEnabled || data.reviewStatus !== 'approved') {
          setError("This report is not authorized for external sharing.");
          return;
        }

        setScan({ id: docSnap.id, ...data });

        // Update Analytics (Passive)
        updateDoc(docRef, {
          viewCount: increment(1),
          lastViewedAt: serverTimestamp()
        });

      } catch (e) {
        console.error(e);
        setError("Unable to load intelligence report.");
      } finally {
        setLoading(false);
      }
    }
    fetchSharedScan();
  }, [params.id]);

  const CATEGORY_SCORES = useMemo(() => {
    if (!scan) return [];
    const r = scan.results;
    return [
      { label: "AI Presence", score: r.categoryScores.presence, icon: Search },
      { label: "Description Accuracy", score: r.categoryScores.descriptionAccuracy, icon: ShieldCheck },
      { label: "Citation Strength", score: r.categoryScores.citationStrength, icon: Target },
      { label: "Service Coverage", score: r.categoryScores.serviceCoverage, icon: Zap },
      { label: "Market Share of Voice", score: r.categoryScores.competitorShareOfVoice, icon: Users },
    ];
  }, [scan]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center animate-pulse">
          <SearchCode className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm font-bold text-primary uppercase tracking-[0.2em]">Decrypting Audit Data...</p>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-4 bg-slate-50">
        <Lock className="w-12 h-12 text-muted-foreground/40" />
        <h1 className="text-2xl font-bold text-primary">Access Restricted</h1>
        <p className="text-muted-foreground max-w-sm">{error || "This intelligence report is no longer available or the link has expired."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20 selection:bg-accent/30">
      {/* Public Branded Header */}
      <header className="h-20 border-b flex items-center px-8 justify-between sticky top-0 bg-white/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-1.5 rounded-lg">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black text-primary tracking-tighter">VizAI Intelligence</span>
            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.3em]">Corporate Discovery Scan</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] font-black text-primary uppercase tracking-widest">{scan.results.companyName}</div>
            <div className="text-[8px] text-muted-foreground uppercase font-medium">Verified Client Audit</div>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <Badge className="bg-green-50 text-green-700 border-green-200 text-[9px] uppercase font-bold tracking-widest">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Approved Audit
          </Badge>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-12 space-y-12">
        {/* Title Section */}
        <div className="space-y-4 border-b-4 border-primary pb-10">
          <div className="flex items-center gap-2 text-[10px] font-black text-accent uppercase tracking-[0.3em]">
            <FileText className="w-3 h-3" /> External Intelligence Briefing
          </div>
          <h1 className="text-5xl font-black text-primary tracking-tighter leading-none">AI Visibility Discovery Audit</h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
            Detailed analysis of search prominence and LLM recommendation patterns for <span className="text-primary font-bold">{scan.results.companyName}</span>.
          </p>
          <div className="flex flex-wrap gap-6 pt-4">
             <div className="space-y-1">
                <div className="text-[9px] font-bold text-muted-foreground uppercase">Audit Reference</div>
                <div className="text-xs font-bold text-primary">AUDIT-{scan.id.slice(0,8).toUpperCase()}</div>
             </div>
             <div className="space-y-1">
                <div className="text-[9px] font-bold text-muted-foreground uppercase">Publication Date</div>
                <div className="text-xs font-bold text-primary">{scan.date?.toDate().toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
             </div>
             <div className="space-y-1">
                <div className="text-[9px] font-bold text-muted-foreground uppercase">Analysis Method</div>
                <div className="text-xs font-bold text-primary italic">VizAI Hybrid Multi-Vector v1.4</div>
             </div>
          </div>
        </div>

        {/* Executive Summary */}
        <section className="grid lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-8 space-y-6">
            <h2 className="text-2xl font-black text-primary tracking-tight flex items-center gap-2">
              <Globe className="w-6 h-6 text-accent" />
              Executive Intelligence Summary
            </h2>
            <div className="text-lg leading-relaxed text-muted-foreground whitespace-pre-wrap font-medium">
              {scan.results.overview}
            </div>
          </div>
          <div className="lg:col-span-4 p-8 bg-primary text-white rounded-[2.5rem] shadow-2xl shadow-primary/20 text-center space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Visibility Index</div>
            <div className="text-7xl font-black tracking-tighter">{scan.results.overallScore.toFixed(1)}</div>
            <div className="text-[10px] font-bold text-accent uppercase tracking-widest">Market Status: Contender</div>
          </div>
        </section>

        {/* Metric Pillars */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {CATEGORY_SCORES.map((cat, i) => (
            <div key={i} className="p-6 bg-slate-50 rounded-3xl flex flex-col items-center text-center space-y-3 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 group">
              <div className="p-3 rounded-2xl bg-white text-primary shadow-sm group-hover:scale-110 transition-transform">
                <cat.icon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-tight">{cat.label}</div>
                <div className="text-3xl font-black text-primary">{cat.score}%</div>
              </div>
            </div>
          ))}
        </div>

        {/* Priority Actions */}
        <section className="space-y-8 pt-10">
          <div className="flex items-center justify-between border-b pb-4">
            <h3 className="text-2xl font-black text-primary tracking-tight flex items-center gap-2">
              <Zap className="w-6 h-6 text-accent" />
              Strategic Implementation Roadmap
            </h3>
            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-primary border-primary/20">
              High-Yield Vectors
            </Badge>
          </div>
          <div className="grid gap-6">
            {scan.results.priorityActions.map((rec: StrategicRecommendation, i: number) => (
              <div key={i} className="p-8 bg-white border border-slate-100 rounded-[2rem] flex flex-col sm:flex-row items-start gap-8 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1">
                <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-xl shrink-0">
                  {i + 1}
                </div>
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3">
                     <div className="text-[10px] font-black text-accent uppercase tracking-widest">{rec.category}</div>
                     <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] font-black uppercase h-5 px-2">
                       {rec.priority} Priority
                     </Badge>
                  </div>
                  <div className="text-xl font-black text-primary leading-tight">{rec.title}</div>
                  <p className="text-muted-foreground leading-relaxed font-medium">{rec.description}</p>
                  <div className="pt-2">
                     <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 text-primary text-[10px] font-black uppercase tracking-widest border">
                       <TrendingUp className="w-3.5 h-3.5 text-accent" />
                       Primary Outcome: {rec.expectedImpact}
                     </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Public Footer */}
        <footer className="pt-20 text-center space-y-6">
          <div className="inline-flex items-center gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
             <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
               <Search className="w-5 h-5 text-white" />
             </div>
             <div className="text-left">
               <div className="text-xs font-black text-primary">VizAI Discovery Intelligence</div>
               <p className="text-[10px] text-muted-foreground font-medium">The standard for professional AI Visibility Auditing.</p>
             </div>
          </div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-[0.4em] font-bold">
            &copy; {new Date().getFullYear()} VizAI Consulting Group • Confidential Client Audit • Ref: {scan.id}
          </div>
        </footer>
      </main>
    </div>
  );
}
