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
  FileCode,
  Globe,
  Info,
  Scale,
  ArrowUpRight,
  ChevronRight,
  TrendingDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect, useMemo } from "react";
import { QueryDiscoveryData, StrategicRecommendation } from "@/lib/types";
import { QueryEngine } from "@/lib/services/query-engine";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { SCORING_MODEL, calculateWeightedScore, calculateProjectedImprovement } from "@/lib/services/scoring-model";

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
      { category: "Entity / Citation Signals", title: "Strengthen Authoritative Mentions", description: "Acquire high-quality backlinks from industry publications to build trust.", priority: "medium", expectedImpact: "Citation strength gain" },
    ] as StrategicRecommendation[]
  }, [scanData]);

  const projection = useMemo(() => calculateProjectedImprovement(results.categoryScores), [results]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Activity className="w-12 h-12 text-primary animate-pulse" />
        <p className="text-muted-foreground font-medium">Analyzing intelligence vectors...</p>
      </div>
    );
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Structured Data': return FileCode;
      case 'Content / Positioning': return FileText;
      case 'Entity / Citation Signals': return Target;
      case 'Competitive Visibility': return Users;
      default: return Zap;
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Executive Report Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
             <FileText className="w-3 h-3 text-accent" />
             Report ID: {params.id === 'latest' ? 'SCAN-LATEST' : params.id} • Private & Confidential
          </div>
          <h2 className="text-4xl font-headline font-bold text-primary tracking-tight">Intelligence Discovery Audit</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            Analysis for <strong className="text-primary font-bold">Client Organization</strong> • Global Market • {new Date().toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5">
            <Share2 className="w-4 h-4" /> Share Access
          </Button>
          <Link href={`/scans/report/${params.id}`}>
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20">
              <ExternalLink className="w-4 h-4" /> Client Report View
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
          tooltip="Consolidated score based on a weighted average of all discovery vectors."
        />
        <ScoreCard 
          title="Description Accuracy" 
          score={results.categoryScores.descriptionAccuracy} 
          trend={1.5} 
          icon={ShieldCheck} 
          description="Business model alignment"
          tooltip="Measures how accurately AI summaries reflect your official services and capabilities."
        />
        <ScoreCard 
          title="Citation Strength" 
          score={results.categoryScores.citationStrength} 
          trend={8.4} 
          icon={Target} 
          description="Authority of data sources"
          tooltip="Analyzes the reliability and authority of external sites cited by AI models."
        />
        <ScoreCard 
          title="Service Coverage" 
          score={results.categoryScores.serviceCoverage} 
          trend={-0.8} 
          icon={Zap} 
          description="Completeness of offerings"
          tooltip="Assesses how many of your key services are recognized during discovery."
        />
        <ScoreCard 
          title="Competitor Threat" 
          score={results.categoryScores.competitorShareOfVoice} 
          trend={-2.1} 
          icon={Users} 
          description="Rival share of search voice"
          tooltip="Tracks how often competitors are recommended over your brand for generic intents."
        />
      </div>

      {/* Optimization Scenario Section */}
      <Card className="border-none shadow-xl bg-gradient-to-br from-primary to-[#0d2a4a] text-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-accent" />
              Optimization Scenario: Projected Impact
            </CardTitle>
            <CardDescription className="text-white/60 text-sm">Estimated visibility gains following implementation of recommended actions</CardDescription>
          </div>
          <Badge className="bg-accent text-primary font-bold px-3 py-1">Strategic Projection</Badge>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid lg:grid-cols-4 gap-8">
            <div className="flex flex-col justify-center items-center p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Current Baseline</div>
              <div className="text-4xl font-bold mb-4">{results.overallScore.toFixed(1)}</div>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white/30" style={{ width: `${results.overallScore}%` }} />
              </div>
            </div>

            <div className="flex flex-col justify-center items-center">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center mb-2">
                <ChevronRight className="w-6 h-6 text-accent" />
              </div>
              <div className="text-[10px] font-bold text-accent uppercase tracking-tighter">Gain: +{projection.totalGain.toFixed(1)}</div>
            </div>

            <div className="flex flex-col justify-center items-center p-6 bg-accent/10 rounded-2xl border border-accent/20 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2">
                <Zap className="w-4 h-4 text-accent animate-pulse" />
              </div>
              <div className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Optimized Projection</div>
              <div className="text-5xl font-bold text-accent mb-4">{projection.projectedOverall.toFixed(1)}</div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${projection.projectedOverall}%` }} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-xs font-bold text-white/70 uppercase mb-2">Growth Vectors</div>
              <div className="space-y-2">
                {projection.improvements.slice(0, 3).map((imp, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 bg-white/5 rounded-lg border border-white/10">
                    <span className="opacity-80">{imp.label}</span>
                    <span className="text-accent font-bold">+{imp.gain}%</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/50 italic leading-tight">
                *Projections assume high-priority deployment of technical entity signals and capability taxonomy clarity.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scoring Explanation Panel */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 py-4 px-6">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Scale className="w-5 h-5 text-primary" />
                Why this score?
              </CardTitle>
              <CardDescription className="text-xs">Transparent weighted scoring framework breakdown</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Overall Visibility</div>
              <div className="text-2xl font-bold text-primary">{results.overallScore.toFixed(1)}</div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead className="pl-6 font-bold uppercase text-[10px]">Vector</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] text-center">Weight</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] text-center">Score</TableHead>
                    <TableHead className="font-bold uppercase text-[10px]">Drivers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SCORING_MODEL.map((cat) => {
                    const score = results.categoryScores[cat.id as keyof typeof results.categoryScores];
                    return (
                      <TableRow key={cat.id}>
                        <TableCell className="pl-6 py-4">
                          <div className="font-bold text-sm text-primary">{cat.label}</div>
                          <p className="text-[10px] text-muted-foreground max-w-[150px] leading-tight mt-1">{cat.description}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary">
                            {(cat.weight * 100).toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold text-primary">
                          {score}%
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap gap-1">
                              {cat.positiveDrivers.map((d, i) => (
                                <span key={i} className="text-[8px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-sm border border-green-100 flex items-center gap-1">
                                  <CheckCircle2 className="w-2 h-2" /> {d}
                                </span>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {cat.negativeDrivers.map((d, i) => (
                                <span key={i} className="text-[8px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded-sm border border-red-100 flex items-center gap-1">
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

        {/* Scoring Insight Summary */}
        <Card className="border-none shadow-sm bg-primary text-white overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Info className="w-5 h-5 text-accent" />
              Scoring Methodology
            </CardTitle>
            <CardDescription className="text-white/70 text-xs">How we derive your intelligence metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm leading-relaxed opacity-90">
              Your score is calculated using a proprietary weighted average across five critical discovery vectors. We prioritize <strong>AI Visibility (30%)</strong> as the primary indicator of search dominance.
            </p>
            <div className="space-y-4">
               <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-white/10 shrink-0">
                    <TrendingUp className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold">Primary Benchmark</h5>
                    <p className="text-xs opacity-70">A score above 85.0 indicates "Leader" status in the AI knowledge layer.</p>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-white/10 shrink-0">
                    <Scale className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold">Dynamic Weighting</h5>
                    <p className="text-xs opacity-70">Weights are tuned based on industry vertical norms (e.g. 3PL vs Legal).</p>
                  </div>
               </div>
            </div>
            <div className="pt-4 border-t border-white/10">
               <div className="flex justify-between items-center text-xs font-bold mb-2 uppercase tracking-widest text-white/50">
                 Market Baseline
                 <span>Avg: 64.2</span>
               </div>
               <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-accent w-[64%]" />
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations & Gaps Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Strategic Next Steps */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-primary/5 py-4 px-6">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-accent" />
                Strategic Next Steps
              </CardTitle>
              <CardDescription className="text-xs">Prioritized sequence for optimization based on core weaknesses</CardDescription>
            </div>
            <Layers className="w-5 h-5 text-primary opacity-20" />
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {results.priorityActions.map((rec: StrategicRecommendation, i: number) => {
                const CategoryIcon = getCategoryIcon(rec.category);
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-muted/20 rounded-xl border border-transparent hover:border-accent/20 transition-all group gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-primary shadow-sm group-hover:bg-accent group-hover:text-white transition-colors shrink-0">
                        <CategoryIcon className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{rec.category}</span>
                           <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] h-4 uppercase px-1">
                             {rec.priority}
                           </Badge>
                        </div>
                        <h4 className="text-sm font-bold text-primary">{rec.title}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-md">{rec.description}</p>
                      </div>
                    </div>
                    <div className="text-right sm:shrink-0">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 text-primary border border-primary/10 text-[10px] font-bold uppercase">
                        <TrendingUp className="w-3 h-3 text-accent" />
                        {rec.expectedImpact}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Missed Opportunities / Gaps */}
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b bg-red-50/30">
            <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-red-500" />
              Critical Visibility Gaps
            </CardTitle>
            <CardDescription className="text-xs">Identified zones where competitors are currently dominant</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {queryDiscovery?.queries.filter(q => !q.results.some(r => r.isTargetCompanyMentioned)).slice(0, 4).map((q, i) => (
                <div key={i} className="p-5 space-y-3 hover:bg-red-50/10 transition-colors">
                  <div className="text-xs font-bold text-primary italic leading-tight">"{q.text}"</div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] text-muted-foreground font-medium mr-1 uppercase">Top Mentions:</span>
                    {q.results[0].mentions.slice(0, 3).map((m, idx) => (
                      <Badge key={idx} variant="outline" className="text-[8px] bg-white text-muted-foreground border-slate-200">
                        {m.companyName}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-bold text-red-500 uppercase tracking-tighter">
                    <AlertTriangle className="w-3 h-3" />
                    Visibility Deficit Identified
                  </div>
                </div>
              ))}
              {(!queryDiscovery || queryDiscovery.queries.every(q => q.results.some(r => r.isTargetCompanyMentioned))) && (
                <div className="p-12 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-500">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-muted-foreground italic">No significant discovery gaps found in current vector set.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Query Discovery Analysis */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b py-6 px-8">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
              <Globe className="w-5 h-5 text-accent" />
              Intelligence Signal Coverage
            </CardTitle>
            <CardDescription>Real-time performance benchmark across multiple discovery intents</CardDescription>
          </div>
          <div className="flex items-center gap-8 pr-4">
            <div className="text-center">
              <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Total Signals</div>
              <div className="text-2xl font-bold text-primary">{queryDiscovery?.summary.totalQueries || 0}</div>
            </div>
            <div className="w-px h-10 bg-border hidden sm:block" />
            <div className="text-center">
              <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Signal Health</div>
              <div className="text-2xl font-bold text-accent">{(queryDiscovery?.summary.coveragePercentage || 0).toFixed(0)}%</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[40%] pl-8 font-bold uppercase text-[10px] tracking-widest text-muted-foreground">User Intent Vector</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Provider Distribution</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Market Mention Set</TableHead>
                  <TableHead className="text-right pr-8 font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Signal Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queryDiscovery?.queries.map((q) => {
                   const isMentioned = q.results.some(r => r.isTargetCompanyMentioned);
                   const topMentions = q.results[0]?.mentions.slice(0, 3).map(m => m.companyName).join(", ");
                   
                   return (
                    <TableRow key={q.id} className="hover:bg-muted/10 transition-colors group">
                      <TableCell className="pl-8 py-5">
                        <div className="font-medium text-primary italic leading-relaxed group-hover:text-accent transition-colors">
                          "{q.text}"
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex -space-x-1.5">
                          {q.results.map((r, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm ring-1 ring-black/5",
                                r.isTargetCompanyMentioned ? 'bg-accent' : 'bg-slate-300'
                              )}
                              title={`${r.provider}: ${r.isTargetCompanyMentioned ? 'Mentioned' : 'Not Mentioned'}`}
                            >
                              {r.provider[0]}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                          {topMentions}
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        {isMentioned ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold uppercase">
                            <Eye className="w-3 h-3" /> Prominent
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold uppercase">
                            <EyeOff className="w-3 h-3" /> Deficit
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

