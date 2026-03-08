
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
  TrendingDown,
  Cpu,
  History,
  GitCompare,
  Check,
  Radar,
  FileSearch,
  Lock,
  Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogTrigger
} from "@/components/ui/dialog";
import { useState, useEffect, useMemo } from "react";
import { QueryDiscoveryData, StrategicRecommendation, QueryRecord, RealQueryResult, ScanResults, ScanRecord } from "@/lib/types";
import { QueryEngine } from "@/lib/services/query-engine";
import { AIResponseParser, ValidationComparison } from "@/lib/services/ai-response-parser";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { SCORING_MODEL, calculateProjectedImprovement } from "@/lib/services/scoring-model";
import { toast } from "@/hooks/use-toast";

export default function ScanResultsPage({ params }: { params: { id: string } }) {
  const [scanRecord, setScanRecord] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
      setLoading(true);
      try {
        if (params.id === 'latest') {
          const scansRef = collection(db, "scans");
          const q = query(scansRef, where("status", "==", "completed"), orderBy("date", "desc"), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setScanRecord({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ScanRecord);
          }
        } else {
          const docRef = doc(db, "scans", params.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setScanRecord({ id: docSnap.id, ...docSnap.data() } as ScanRecord);
          }
        }
      } catch (e) {
        console.error("Error loading scan:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [params.id]);

  const results = useMemo(() => scanRecord?.results || {
    overallScore: 72.4,
    categoryScores: { presence: 78, descriptionAccuracy: 88, citationStrength: 65, serviceCoverage: 54, competitorShareOfVoice: 42 },
    priorityActions: [] as StrategicRecommendation[]
  } as ScanResults, [scanRecord]);

  const queryDiscovery = useMemo(() => scanRecord?.queryDiscovery || null, [scanRecord]);
  const realQueryResults = useMemo(() => scanRecord?.realQueryResults || [], [scanRecord]);

  const projection = useMemo(() => calculateProjectedImprovement(results.categoryScores), [results]);

  const validationComparisons = useMemo(() => {
    if (!realQueryResults || !queryDiscovery) return [];
    return realQueryResults.map(real => {
      const simulated = queryDiscovery.queries.find(q => q.text === real.query);
      return AIResponseParser.generateComparison(real, simulated);
    });
  }, [realQueryResults, queryDiscovery]);

  const aggregateAccuracy = useMemo(() => {
    return AIResponseParser.calculateAggregateAccuracy(validationComparisons);
  }, [validationComparisons]);

  const opportunities = useMemo(() => {
    if (!queryDiscovery) return [];

    return queryDiscovery.queries
      .filter(q => !q.results.some(r => r.isTargetCompanyMentioned))
      .map(q => {
        const competitors = Array.from(new Set(
          q.results.flatMap(r => r.mentions.map(m => m.companyName))
        )).filter(name => name !== (results?.companyName || "Acme Logistics"));

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
  }, [queryDiscovery, results]);

  const copyShareLink = () => {
    const url = `${window.location.origin}/share/${scanRecord?.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "External presentation URL copied to clipboard.",
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Reconstructing intelligence knowledge graph...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-700">
      {/* Executive Report Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
               <FileText className="w-3 h-3 text-accent" />
               Report Identifier: {params.id === 'latest' ? 'SCAN-LATEST' : `SCAN-${params.id.slice(0,8).toUpperCase()}`}
            </div>
            {scanRecord?.reviewStatus && (
              <Badge 
                variant={scanRecord.reviewStatus === 'approved' ? 'default' : 'secondary'}
                className={cn(
                  "text-[9px] uppercase font-bold tracking-widest h-5",
                  scanRecord.reviewStatus === 'approved' ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground"
                )}
              >
                {scanRecord.reviewStatus === 'approved' ? <Lock className="w-3 h-3 mr-1" /> : <FileSearch className="w-3 h-3 mr-1" />}
                Review: {scanRecord.reviewStatus}
              </Badge>
            )}
          </div>
          <h2 className="text-4xl font-headline font-black text-primary tracking-tighter">Discovery Intelligence Audit</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            Subject: <strong className="text-primary font-black">{results.companyName || "Client Account"}</strong> • {results.industry || "Global Market"} • {new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}
          </p>
        </div>
        <div className="flex gap-3">
          {scanRecord?.shareEnabled ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 rounded-full">
                  <Share2 className="w-4 h-4" /> Shared Access
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>External Presentation Link</DialogTitle>
                  <DialogDescription>
                    This audit has been approved for external sharing. Anyone with this link can view the read-only presentation.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center space-x-2 pt-4">
                  <div className="grid flex-1 gap-2">
                    <label htmlFor="link" className="sr-only">Link</label>
                    <div className="flex items-center gap-2 bg-muted/50 p-3 rounded-xl">
                      <span className="text-xs font-medium truncate flex-1">
                        {`${window.location.origin}/share/${scanRecord.id}`}
                      </span>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copyShareLink}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-4 border-t mt-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <span>View Count: {scanRecord.viewCount || 0}</span>
                  <span>Last Viewed: {scanRecord.lastViewedAt ? scanRecord.lastViewedAt.toDate().toLocaleDateString() : 'Never'}</span>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 rounded-full opacity-50 cursor-not-allowed" disabled>
              <Lock className="w-4 h-4" /> Share Access
            </Button>
          )}
          <Link href={`/scans/report/${params.id}`}>
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 rounded-full px-6">
              <ExternalLink className="w-4 h-4" /> Presentation View
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

      <div className="grid lg:grid-cols-12 gap-6">
         {/* Simulation Accuracy Card */}
         <Card className="lg:col-span-4 border-none shadow-md bg-white overflow-hidden">
            <CardHeader className="pb-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-black text-primary flex items-center gap-2">
                <Radar className="w-4 h-4 text-accent" />
                Simulation Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8 space-y-6 text-center">
              <div className="relative inline-flex items-center justify-center">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-muted/30"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={364.4}
                    strokeDashoffset={364.4 - (364.4 * (aggregateAccuracy || results.simulationAccuracy || 74)) / 100}
                    className="text-accent transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-black text-primary">{(aggregateAccuracy || results.simulationAccuracy || 74).toFixed(0)}%</span>
                  <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Fidelity Score</span>
                </div>
              </div>
              <div className="space-y-2">
                 <p className="text-xs font-medium text-muted-foreground leading-relaxed px-4">
                   This score measures how closely VizAI&apos;s discovery simulation matches real AI responses from Gemini 1.5 Flash knowledge models.
                 </p>
              </div>
            </CardContent>
         </Card>

         {/* Real AI Validation Table */}
         <Card className="lg:col-span-8 border-none shadow-md bg-white overflow-hidden border-l-4 border-l-accent">
            <CardHeader className="flex flex-row items-center justify-between bg-accent/5 py-4 px-8">
              <div className="space-y-1">
                <CardTitle className="text-lg font-black text-primary flex items-center gap-2 tracking-tight">
                  <GitCompare className="w-5 h-5 text-accent" />
                  Real AI Validation
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Simulation vs. Live Ground Truth</CardDescription>
              </div>
              <Badge className="bg-primary text-white text-[9px] uppercase tracking-[0.2em] px-2 py-1">Model Accuracy Audit</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid divide-y">
                {(validationComparisons.length > 0 ? validationComparisons : []).slice(0, 2).map((comp, i) => (
                  <div key={i} className="p-6 grid md:grid-cols-12 gap-6 hover:bg-muted/5 transition-colors">
                    <div className="md:col-span-6 space-y-2">
                       <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Vector: "{comp.query}"</div>
                       <div className="flex items-center gap-3">
                          <div className="text-xs font-bold text-primary">Alignment</div>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                             <div className="h-full bg-accent" style={{ width: `${comp.alignmentScore}%` }} />
                          </div>
                          <span className="text-xs font-black text-primary">{comp.alignmentScore.toFixed(0)}%</span>
                       </div>
                    </div>
                    <div className="md:col-span-3">
                       <div className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Simulated</div>
                       <div className="text-[10px] font-medium opacity-70 truncate">{comp.simulatedMentions.slice(0,2).join(", ")}...</div>
                    </div>
                    <div className="md:col-span-3">
                       <div className="text-[9px] font-bold text-accent uppercase mb-1">Real AI</div>
                       <div className="text-[10px] font-bold text-primary truncate">{comp.realMentions.slice(0,2).join(", ")}...</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
         </Card>
      </div>

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
                {opportunities.map((opp) => (
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
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Optimization Scenario */}
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
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
