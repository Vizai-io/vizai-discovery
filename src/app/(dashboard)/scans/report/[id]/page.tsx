
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Printer, 
  ChevronLeft, 
  ShieldCheck, 
  Target, 
  Search, 
  Zap, 
  Users,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Globe,
  Briefcase,
  TrendingUp,
  FileCode,
  Layers,
  ArrowRight,
  ShieldAlert,
  Lightbulb,
  ArrowUpRight
} from "lucide-react";
import Link from "next/link";
import { QueryDiscoveryData, StrategicRecommendation } from "@/lib/types";
import { QueryEngine } from "@/lib/services/query-engine";
import { cn } from "@/lib/utils";
import { collection, doc, getDoc, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase-config";

export default function ClientReportPage({ params }: { params: { id: string } }) {
  const [scanData, setScanData] = useState<any>(null);
  const [queryDiscovery, setQueryDiscovery] = useState<QueryDiscoveryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
      setLoading(true);
      try {
        let results;
        let discovery;

        if (params.id === 'latest') {
          const scansRef = collection(db, "scans");
          const q = query(scansRef, where("status", "==", "completed"), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            results = data.results;
            discovery = data.queryDiscovery;
          }
        } else {
          const docRef = doc(db, "scans", params.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            results = data.results;
            discovery = data.queryDiscovery;
          }
        }

        if (results) {
          setScanData(results);
          setQueryDiscovery(discovery || null);
        }
      } catch (e) {
        console.error("Error loading report:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [params.id]);

  const opportunities = useMemo(() => {
    if (!queryDiscovery) return [];

    return queryDiscovery.queries
      .filter(q => !q.results.some(r => r.isTargetCompanyMentioned))
      .map(q => {
        const competitors = Array.from(new Set(
          q.results.flatMap(r => r.mentions.map(m => m.companyName))
        )).filter(name => name !== (scanData?.companyName || "Acme Logistics"));

        let priority: 'high' | 'medium' | 'low' = 'low';
        if (q.intentType === 'best' || q.intentType === 'comparison') priority = 'high';
        else if (q.intentType === 'capability') priority = 'medium';

        return {
          id: q.id,
          query: q.text,
          competitors,
          intentType: q.intentType || 'Generic',
          priority,
          potential: priority === 'high' ? 'Significant Visibility Uplift' : 'Incremental Authority'
        };
      })
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      })
      .slice(0, 5); // Show top 5 in report
  }, [queryDiscovery, scanData]);

  const handlePrint = () => {
    window.print();
  };

  const results = scanData || {
    overallScore: 72.4,
    categoryScores: { presence: 78, descriptionAccuracy: 88, citationStrength: 65, serviceCoverage: 54, competitorShareOfVoice: 42 },
    priorityActions: [
      { category: "Structured Data", title: "Deploy JSON-LD Entity Schema", description: "Implement technical schema markup to clarify business entities for AI models.", priority: "high", expectedImpact: "Accuracy gain" },
      { category: "Content / Positioning", title: "Publish AI-Ready Capabilities Page", description: "Create a dedicated landing page designed specifically for LLM ingestion.", priority: "high", expectedImpact: "Visibility gain" },
      { category: "Entity / Citation Signals", title: "Strengthen Authoritative Mentions", description: "Acquire high-quality backlinks from industry publications to build trust.", priority: "medium", expectedImpact: "Citation strength gain" },
    ] as StrategicRecommendation[]
  };

  const CATEGORY_SCORES = [
    { label: "AI Presence", score: results.categoryScores.presence, icon: Search },
    { label: "Description Accuracy", score: results.categoryScores.descriptionAccuracy, icon: ShieldCheck },
    { label: "Citation Strength", score: results.categoryScores.citationStrength, icon: Target },
    { label: "Service Coverage", score: results.categoryScores.serviceCoverage, icon: Zap },
    { label: "Market Share of Voice", score: results.categoryScores.competitorShareOfVoice, icon: Users },
  ];

  const showVisibilityCTA = results.overallScore < 40;
  const showCompetitorCTA = results.categoryScores.competitorShareOfVoice > 50;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 print:space-y-6 print:pb-0">
      {/* Report Controls - Hidden on Print */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/scans/results/${params.id}`}>
          <Button variant="ghost" className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
        </Link>
        <Button onClick={handlePrint} className="gap-2 bg-primary text-white shadow-lg">
          <Printer className="w-4 h-4" /> Export / Print Audit
        </Printer>
      </div>

      {/* Report Header */}
      <header className="border-b-4 border-primary pb-8 space-y-6 print:pb-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              <FileText className="w-3 h-3 text-accent" />
              Client Intelligence Report • Private & Confidential
            </div>
            <h1 className="text-4xl font-headline font-bold text-primary leading-tight">AI Visibility Discovery Audit</h1>
            <p className="text-lg text-muted-foreground">Comprehensive analysis of search prominence and LLM recommendation patterns.</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">VizAI</div>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Consulting Group</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-muted/30 p-6 rounded-2xl border print:p-4 print:bg-white print:border-slate-200">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Target Organization</div>
            <div className="text-sm font-bold text-primary">{results.companyName || "Client Account"}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Analysis Scale</div>
            <div className="text-sm font-bold text-primary">Multi-Vector</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Geography</div>
            <div className="text-sm font-bold text-primary">Global Context</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Audit Date</div>
            <div className="text-sm font-bold text-primary">{new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </header>

      {/* Strategic Interventions - Contextual CTAs */}
      {(showVisibilityCTA || showCompetitorCTA) && (
        <section className="grid md:grid-cols-2 gap-4 print:hidden">
          {showVisibilityCTA && (
            <Card className="border-none bg-destructive/5 border-l-4 border-l-destructive shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3 text-destructive">
                  <ShieldAlert className="w-5 h-5" />
                  <h4 className="font-bold">Critical Visibility Deficit</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your business is largely invisible to AI systems. High-intent queries are failing to resolve to your brand entity.
                </p>
                <Button className="w-full bg-destructive hover:bg-destructive/90 text-white text-xs h-9">
                  Request VizAI Optimization Plan
                </Button>
              </CardContent>
            </Card>
          )}
          {showCompetitorCTA && (
            <Card className="border-none bg-accent/5 border-l-4 border-l-accent shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3 text-accent">
                  <Users className="w-5 h-5" />
                  <h4 className="font-bold">Competitive Displacement</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your competitors dominate AI discovery queries. They currently capture majority share-of-voice in your vertical.
                </p>
                <Button className="w-full bg-primary hover:bg-primary/90 text-white text-xs h-9">
                  See How VizAI Improves Discoverability
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* Executive Summary Section */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6 border-b pb-6 print:pb-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-primary">Executive Summary</h2>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              This audit details the AI Visibility Index and discoverability footprint for your organization. Current metrics indicate a baseline prominence, yet significant gaps exist in specific high-intent intents where competitors are currently capturing majority share of voice. Tactical adjustments to entity signals and capability positioning are required to regain parity.
            </p>
          </div>
          <div className="sm:ml-auto text-center p-4 bg-primary text-white rounded-2xl shadow-xl min-w-[140px] print:shadow-none print:border print:border-primary print:text-primary print:bg-white">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Overall Score</div>
            <div className="text-5xl font-bold">{results.overallScore.toFixed(1)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {CATEGORY_SCORES.map((cat, i) => (
            <div key={i} className="p-4 bg-white rounded-xl border border-slate-100 flex flex-col items-center text-center space-y-2 print:border-slate-200 shadow-sm print:shadow-none">
              <div className="p-2 rounded-lg bg-primary/5 text-primary">
                <cat.icon className="w-5 h-5" />
              </div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">{cat.label}</div>
              <div className="text-2xl font-bold text-primary">{cat.score}%</div>
            </div>
          ))}
        </div>
      </section>

      {/* Discovery Opportunity Engine - NEW for Report */}
      <section className="space-y-4 pt-8 print:pt-4 page-break-before-auto">
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="text-xl font-bold text-primary flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-accent" />
            Strategic Discovery Opportunities
          </h3>
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">
            Signal Gaps identified vs Rivals
          </Badge>
        </div>
        
        <div className="space-y-3">
          {opportunities.map((opp, i) => (
            <div key={opp.id} className="p-4 bg-white border border-slate-100 rounded-xl flex items-center justify-between print:border-slate-200">
               <div className="space-y-1">
                 <div className="text-[10px] font-bold text-muted-foreground uppercase">{opp.intentType} Vector</div>
                 <div className="text-sm font-bold text-primary italic">"{opp.query}"</div>
                 <div className="text-[9px] text-muted-foreground">Captured by: {opp.competitors.join(", ")}</div>
               </div>
               <div className="text-right space-y-1">
                  <Badge variant={opp.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] uppercase">
                    {opp.priority} Yield
                  </Badge>
                  <div className="text-[10px] font-bold text-accent flex items-center justify-end gap-1">
                    {opp.potential} <ArrowUpRight className="w-3 h-3" />
                  </div>
               </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recommendations Section */}
      <section className="space-y-4 pt-8 print:pt-4 page-break-before-auto">
        <h3 className="text-xl font-bold text-primary flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Strategic Strategic Actions
        </h3>
        <div className="space-y-4">
          {results.priorityActions.map((rec: StrategicRecommendation, i: number) => (
            <div key={i} className="p-6 bg-white border border-slate-100 rounded-2xl flex flex-col sm:flex-row items-start gap-6 print:border-slate-200 shadow-sm print:shadow-none">
              <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg shrink-0 print:border print:border-primary print:text-primary print:bg-white">
                {i + 1}
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                   <div className="text-[10px] font-bold text-accent uppercase tracking-widest">{rec.category}</div>
                   <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] uppercase h-4 px-1 leading-none">
                     {rec.priority} Priority
                   </Badge>
                </div>
                <div className="text-lg font-bold text-primary">{rec.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{rec.description}</p>
                <div className="pt-2">
                   <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 text-primary text-[10px] font-bold uppercase">
                     <TrendingUp className="w-3 h-3 text-accent" />
                     Primary Outcome: {rec.expectedImpact}
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Consulting Footnote for Report */}
      <section className="p-8 bg-muted/20 border-2 border-dashed rounded-[2rem] text-center space-y-4 print:hidden">
        <h4 className="text-xl font-bold text-primary">Need an Implementation Roadmap?</h4>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Our strategy team specializes in entity signal fortification and technical AI knowledge graph positioning.
        </p>
        <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-8">
          Schedule Strategy Briefing
        </Button>
      </section>

      {/* Discovery Analysis Table Section */}
      <section className="space-y-4 pt-8 print:pt-4 page-break-before-auto">
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="text-xl font-bold text-primary flex items-center gap-2">
            <Globe className="w-5 h-5 text-accent" />
            Intelligence Signal Coverage
          </h3>
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">
            Audit of Multi-Vector Intents
          </Badge>
        </div>
        
        <div className="overflow-hidden rounded-xl border border-slate-200 print:rounded-none">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b print:bg-white">
              <tr>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Query Vector</th>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest text-center">Signal Presence</th>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Dominant Mentions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queryDiscovery?.queries.slice(0, 10).map((q, i) => {
                const isMentioned = q.results.some(r => r.isTargetCompanyMentioned);
                return (
                  <tr key={i} className="print:bg-white">
                    <td className="px-6 py-4 font-medium text-primary italic text-xs">"{q.text}"</td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1">
                        {isMentioned ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                        )}
                        <span className={cn("text-[10px] font-bold uppercase", isMentioned ? "text-green-600" : "text-red-500")}>
                          {isMentioned ? "Presence" : "Deficit"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[10px] text-muted-foreground font-medium">
                      {q.results[0].mentions.slice(0, 3).map(m => m.companyName).join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer Branding for Print */}
      <footer className="hidden print:block pt-12 text-center space-y-2 border-t mt-12">
        <div className="text-sm font-bold text-primary">VizAI Discovery Intelligence Audit</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em]">www.vizai-scanner.ai • Confidential Proprietary Analysis</div>
      </footer>
    </div>
  );
}
