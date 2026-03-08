
"use client";

import { ScoreCard } from "@/components/dashboard/score-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShieldCheck, 
  Target, 
  Users, 
  Search, 
  Zap, 
  Share2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Eye,
  EyeOff,
  Lightbulb,
  TrendingUp,
  Activity,
  ExternalLink,
  Layers,
  Globe,
  Info,
  Scale,
  Sparkles,
  Loader2,
  ArrowRight,
  ShieldAlert,
  ArrowUpRight,
  ChevronRight,
  TrendingDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect, useMemo } from "react";
import { QueryDiscoveryData, StrategicRecommendation, QueryRecord } from "@/lib/types";
import { QueryEngine } from "@/lib/services/query-engine";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { SCORING_MODEL, calculateProjectedImprovement } from "@/lib/services/scoring-model";

export default function ScanResultsPage({ params }: { params: { id: string } }) {
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
          const q = query(scansRef, where("status", "==", "completed"), orderBy("date", "desc"), limit(1));
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
        } else {
          const simulatedDiscovery = await QueryEngine.simulateDiscovery(
            "Acme Logistics",
            "Third Party Logistics (3PL)",
            "Western Europe",
            ["FedEx", "UPS", "DHL"]
          );
          setQueryDiscovery(simulatedDiscovery);
        }
      } catch (e) {
        console.error("Error loading scan:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [params.id]);

  const results = useMemo(() => scanData || {
    overallScore: 72.4,
    categoryScores: { presence: 78, descriptionAccuracy: 88, citationStrength: 65, serviceCoverage: 54, competitorShareOfVoice: 42 },
    priorityActions: [
      { category: "Structured Data", title: "Deploy JSON-LD Entity Schema", description: "Implement technical schema markup to clarify business entities for AI models.", priority: "high", expectedImpact: "Accuracy gain" },
      { category: "Content / Positioning", title: "Publish AI-Ready Capabilities Page", description: "Create a dedicated landing page designed specifically for LLM ingestion.", priority: "high", expectedImpact: "Visibility gain" },
    ] as StrategicRecommendation[]
  }, [scanData]);

  const projection = useMemo(() => calculateProjectedImprovement(results.categoryScores), [results]);

  // Query Opportunity Engine Logic
  const opportunities = useMemo(() => {
    if (!queryDiscovery) return [];

    return queryDiscovery.queries
      .filter(q => !q.results.some(r => r.isTargetCompanyMentioned))
      .map(q => {
        // Find competitors appearing in these missed results
        const competitors = Array.from(new Set(
          q.results.flatMap(r => r.mentions.map(m => m.companyName))
        )).filter(name => name !== (scanData?.companyName || "Acme Logistics"));

        // Determine priority based on intent
        let priority: 'high' | 'medium' | 'low' = 'low';
        if (q.intentType === 'best' || q.intentType === 'comparison') priority = 'high';
        else if (q.intentType === 'capability') priority = 'medium';

        return {
          id: q.id,
          query: q.text,
          competitors,
          category: q.category || 'Discovery Intent',
          intentType: q.intentType || 'Generic',
          priority,
          potential: priority === 'high' ? 'Significant Visibility Uplift' : priority === 'medium' ? 'Targeted Share of Voice' : 'Niche Authority'
        };
      })
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      });
  }, [queryDiscovery, scanData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Reconstructing intelligence knowledge graph...</p>
      </div>
    );
  }

  const showVisibilityCTA = results.overallScore < 40;
  const showCompetitorCTA = results.categoryScores.competitorShareOfVoice > 50;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-700">
      {/* Executive Report Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
             <FileText className="w-3 h-3 text-accent" />
             Report Identifier: {params.id === 'latest' ? 'SCAN-LATEST' : `SCAN-${params.id.slice(0,8).toUpperCase()}`}
          </div>
          <h2 className="text-4xl font-headline font-black text-primary tracking-tighter">Discovery Intelligence Audit</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            Subject: <strong className="text-primary font-black">{results.companyName || "Client Account"}</strong> • {results.industry || "Global Market"} • {new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 rounded-full">
            <Share2 className="w-4 h-4" /> Share Access
          </Button>
          <Link href={`/scans/report/${params.id}`}>
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 rounded-full px-6">
              <ExternalLink className="w-4 h-4" /> Client Presentation View
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard 
          title="Overall Visibility" 
          score={results.overallScore} 
          trend={4.2} 
          icon={Search} 
          className="bg-primary text-white" 
          description="Avg. AI prominence"
          tooltip="Consolidated Index based on multi-vector intent resolution."
        />
        <ScoreCard 
          title="Description Accuracy" 
          score={results.categoryScores.descriptionAccuracy} 
          trend={1.5} 
          icon={ShieldCheck} 
          description="Model alignment"
          tooltip="Accuracy of AI summaries vs official brand data."
        />
        <ScoreCard 
          title="Citation Strength" 
          score={results.categoryScores.citationStrength} 
          trend={8.4} 
          icon={Target} 
          description="Authority sourcing"
          tooltip="Quality and volume of authoritative external citations."
        />
        <ScoreCard 
          title="Service Coverage" 
          score={results.categoryScores.serviceCoverage} 
          trend={-0.8} 
          icon={Zap} 
          description="Indexing depth"
          tooltip="Breath of service taxonomy resolution across models."
        />
        <ScoreCard 
          title="Competitor Threat" 
          score={results.categoryScores.competitorShareOfVoice} 
          trend={-2.1} 
          icon={Users} 
          description="Rival prominence"
          tooltip="Aggressiveness of rival recommendations in similar queries."
        />
      </div>

      {/* Contextual CTAs */}
      {(showVisibilityCTA || showCompetitorCTA) && (
        <div className="grid md:grid-cols-2 gap-4">
          {showVisibilityCTA && (
            <Card className="border-none bg-destructive/5 border-l-4 border-l-destructive shadow-sm">
              <CardContent className="p-6 flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-destructive/10 rounded-full text-destructive">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-primary">Your business is largely invisible to AI systems.</h4>
                    <p className="text-sm text-muted-foreground">High-intent query vectors currently fail to resolve to your entity.</p>
                  </div>
                </div>
                <Button className="bg-destructive hover:bg-destructive/90 text-white gap-2 shrink-0">
                  Request VizAI Optimization Plan <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          )}
          {showCompetitorCTA && (
            <Card className="border-none bg-accent/5 border-l-4 border-l-accent shadow-sm">
              <CardContent className="p-6 flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-accent/10 rounded-full text-accent">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-primary">Your competitors dominate AI discovery queries.</h4>
                    <p className="text-sm text-muted-foreground">Competitors are capturing 80%+ of recommended share-of-voice.</p>
                  </div>
                </div>
                <Button className="bg-primary hover:bg-primary/90 text-white gap-2 shrink-0">
                  See How VizAI Improves Discoverability <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Discovery Opportunity Engine */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-primary/5 py-4 px-8">
          <div className="space-y-1">
            <CardTitle className="text-xl font-black text-primary flex items-center gap-2 tracking-tight">
              <Lightbulb className="w-5 h-5 text-accent" />
              AI Discovery Opportunities
            </CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest opacity-60">High-potential vectors captured by competitors</CardDescription>
          </div>
          <Badge className="bg-accent text-primary font-black px-3 py-1 text-[10px] uppercase tracking-widest border-none">
            {opportunities.length} Vectors Identified
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-8 font-bold uppercase text-[10px] tracking-widest">Discovery Intent Vector</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest">Captured By Rivals</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">Category</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">Priority</TableHead>
                  <TableHead className="pr-8 font-bold uppercase text-[10px] tracking-widest text-right">Yield Potential</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.length > 0 ? (
                  opportunities.map((opp) => (
                    <TableRow key={opp.id} className="hover:bg-muted/10 transition-colors group">
                      <TableCell className="pl-8 py-5">
                        <div className="font-bold text-primary italic text-xs leading-relaxed group-hover:text-accent transition-colors">
                          "{opp.query}"
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {opp.competitors.map((comp, i) => (
                            <Badge key={i} variant="outline" className="text-[8px] bg-muted/50 border-none px-1.5 h-4">
                              {comp}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                         <span className="text-[10px] font-bold text-muted-foreground uppercase">{opp.intentType}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={opp.priority === 'high' ? 'destructive' : opp.priority === 'medium' ? 'default' : 'secondary'}
                          className="text-[8px] uppercase px-2 py-0.5"
                        >
                          {opp.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                         <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-primary">
                            {opp.potential}
                            <ArrowUpRight className="w-3 h-3 text-accent" />
                         </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                         <CheckCircle2 className="w-10 h-10 text-green-500/20" />
                         <p className="text-sm text-muted-foreground italic font-medium">No major signal gaps identified in recent intent simulations.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Projected Improvement: Optimization Scenario */}
      <Card className="border-none shadow-2xl bg-gradient-to-br from-[#174C80] via-[#0d2a4a] to-black text-white overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/20 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 transition-all duration-700 group-hover:scale-110" />
        <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-black flex items-center gap-2 tracking-tight">
              <Sparkles className="w-7 h-7 text-accent animate-pulse" />
              Optimization Scenario
            </CardTitle>
            <CardDescription className="text-white/60 text-base">Projected visibility uplift following strategic implementations</CardDescription>
          </div>
          <Badge className="bg-accent text-primary font-black px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] border-none">Consultant Projection</Badge>
        </CardHeader>
        <CardContent className="pt-8 relative z-10">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5 grid grid-cols-2 gap-4">
              <div className="p-8 bg-white/5 rounded-[2rem] border border-white/10 text-center space-y-2 backdrop-blur-md">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Current Index</div>
                <div className="text-5xl font-black">{results.overallScore.toFixed(1)}</div>
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-tighter">Market Baseline: 64.2</div>
              </div>
              <div className="p-8 bg-accent/10 rounded-[2rem] border border-accent/30 text-center space-y-2 relative overflow-hidden backdrop-blur-md group/proj">
                <div className="absolute top-0 left-0 w-full h-1 bg-accent/50 animate-pulse" />
                <div className="text-[10px] font-bold text-accent uppercase tracking-[0.2em]">Projected Index</div>
                <div className="text-5xl font-black text-accent">{projection.projectedOverall.toFixed(1)}</div>
                <div className="text-[10px] text-accent/80 font-black uppercase">+{projection.totalGain.toFixed(1)} Yield</div>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-4">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                   <Layers className="w-4 h-4" /> Yield Vectors by Category
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {projection.improvements.map((imp, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group/v hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_12px_rgba(0,210,255,1)]" />
                        <span className="text-sm font-bold opacity-80">{imp.label}</span>
                      </div>
                      <span className="text-sm font-black text-accent">+{imp.gain}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex gap-4 items-start">
                  <Lightbulb className="w-6 h-6 text-accent shrink-0 mt-1" />
                  <p className="text-xs text-white/60 leading-relaxed italic">
                    "Implementation of technical JSON-LD entity signals and authoritative backlink acquisition is projected to drive a significant gain in Overall Index resolution."
                  </p>
                </div>
                <Button className="bg-accent hover:bg-accent/90 text-primary font-bold rounded-full px-6 shadow-lg shadow-accent/20 shrink-0">
                  Implement Strategy
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Why this score? */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 py-4 px-8">
            <div>
              <CardTitle className="text-lg font-black text-primary flex items-center gap-2 tracking-tight">
                <Scale className="w-5 h-5 text-primary opacity-40" />
                Audit Scoring Logic
              </CardTitle>
              <CardDescription className="text-xs font-medium uppercase tracking-widest opacity-60">Weighted transparency framework</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Visibility Index</div>
              <div className="text-3xl font-black text-primary">{results.overallScore.toFixed(1)}</div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead className="pl-8 font-bold uppercase text-[10px] tracking-widest">Audit Vector</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">Weight</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">Score</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest pr-8">Positive/Negative Drivers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SCORING_MODEL.map((cat) => {
                    const score = results.categoryScores[cat.id as keyof typeof results.categoryScores] || 0;
                    return (
                      <TableRow key={cat.id} className="hover:bg-muted/10 transition-colors">
                        <TableCell className="pl-8 py-5">
                          <div className="font-bold text-sm text-primary">{cat.label}</div>
                          <p className="text-[10px] text-muted-foreground max-w-[160px] leading-tight mt-1 font-medium">{cat.description}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary font-bold">
                            {(cat.weight * 100).toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-black text-primary text-lg">
                          {score}%
                        </TableCell>
                        <TableCell className="py-5 pr-8">
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1">
                              {cat.positiveDrivers.slice(0, 2).map((d, i) => (
                                <span key={i} className="text-[8px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-sm border border-green-100 flex items-center gap-1">
                                  <CheckCircle2 className="w-2 h-2" /> {d}
                                </span>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {cat.negativeDrivers.slice(0, 2).map((d, i) => (
                                <span key={i} className="text-[8px] font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded-sm border border-red-100 flex items-center gap-1">
                                  <AlertTriangle className="w-2 h-2" /> {d}
                                </span>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Methodology Card */}
        <Card className="border-none shadow-sm bg-primary text-white overflow-hidden relative group">
          <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative z-10">
            <CardTitle className="text-lg font-black flex items-center gap-2 tracking-tight">
              <Info className="w-5 h-5 text-accent" />
              Scoring Methodology
            </CardTitle>
            <CardDescription className="text-white/70 text-xs font-bold uppercase tracking-widest">System Architecture v1.2</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 relative z-10">
            <p className="text-sm leading-relaxed opacity-80 font-medium italic">
              "Our engine performs multi-vector discovery simulations to analyze brand-entity association patterns."
            </p>
            <div className="space-y-4">
               <div className="flex items-start gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <TrendingUp className="w-5 h-5 text-accent shrink-0" />
                  <div>
                    <h5 className="text-sm font-bold">Leader Benchmark</h5>
                    <p className="text-xs opacity-60 font-medium">Scores exceeding 85.0 indicate authoritative status.</p>
                  </div>
               </div>
               <div className="p-4 bg-accent/20 rounded-2xl border border-accent/40 text-center">
                  <h5 className="text-xs font-bold text-accent uppercase tracking-widest mb-2">Strategy Consultation</h5>
                  <Button variant="outline" className="w-full text-[10px] h-8 border-accent/30 text-white hover:bg-accent/10">
                    Review with Consultant
                  </Button>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Query Discovery Analysis */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b py-6 px-8">
          <div className="space-y-1">
            <CardTitle className="text-xl font-black text-primary flex items-center gap-2 tracking-tighter">
              <Globe className="w-5 h-5 text-accent" />
              Discovery Signal Coverage
            </CardTitle>
            <CardDescription className="font-medium">Audit of real-time performance across simulated intent vectors</CardDescription>
          </div>
          <div className="flex items-center gap-8 pr-4">
            <div className="text-center">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Signals</div>
              <div className="text-3xl font-black text-primary">{queryDiscovery?.summary.totalQueries || 0}</div>
            </div>
            <div className="w-px h-12 bg-border hidden sm:block" />
            <div className="text-center">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Signal Health</div>
              <div className="text-3xl font-black text-accent">{(queryDiscovery?.summary.coveragePercentage || 0).toFixed(0)}%</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[45%] pl-8 font-bold uppercase text-[10px] tracking-[0.2em]">User Intent Vector</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-[0.2em] text-center">Model Resolution</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-[0.2em]">Market Mentions</TableHead>
                  <TableHead className="text-right pr-8 font-bold uppercase text-[10px] tracking-[0.2em]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queryDiscovery?.queries.map((q) => {
                   const isMentioned = q.results.some(r => r.isTargetCompanyMentioned);
                   const topMentions = q.results[0]?.mentions.slice(0, 3).map(m => m.companyName).join(", ");
                   
                   return (
                    <TableRow key={q.id} className="hover:bg-muted/10 transition-colors group">
                      <TableCell className="pl-8 py-5">
                        <div className="font-bold text-primary italic leading-relaxed group-hover:text-accent transition-colors text-xs">
                          "{q.text}"
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center -space-x-2">
                          {q.results.map((r, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black text-white shadow-sm ring-1 ring-black/5",
                                r.isTargetCompanyMentioned ? 'bg-accent' : 'bg-slate-300'
                              )}
                              title={`${r.provider}: ${r.isTargetCompanyMentioned ? 'Resolved' : 'No Signal'}`}
                            >
                              {r.provider[0]}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-[11px] text-muted-foreground font-bold tracking-tight">
                          {topMentions}
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        {isMentioned ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100 text-[9px] font-black uppercase tracking-widest">
                            <Eye className="w-3.5 h-3.5" /> Prominent
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-100 text-[9px] font-black uppercase tracking-widest">
                            <EyeOff className="w-3.5 h-3.5" /> Signal Gap
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
