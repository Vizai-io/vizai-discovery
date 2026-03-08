
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
  FileText,
  Lightbulb,
  ExternalLink,
  Layers,
  Globe,
  Loader2,
  ArrowRight,
  ShieldAlert,
  ArrowUpRight,
  GitCompare,
  Radar,
  FileSearch,
  Lock,
  Copy,
  Briefcase,
  AlertCircle,
  RefreshCcw,
  Info
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
import { StrategicRecommendation, ScanResults, ScanRecord } from "@/lib/types";
import { AIResponseParser } from "@/lib/services/ai-response-parser";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { doc, getDoc, getDocs, collection, query, where, limit, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { calculateProjectedImprovement } from "@/lib/services/scoring-model";
import { toast } from "@/hooks/use-toast";
import { ConsultationRequestDialog } from "@/components/consultation/consultation-request-dialog";

export default function ScanResultsPage({ params }: { params: { id: string } }) {
  const [scanRecord, setScanRecord] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id === 'latest') {
      const q = query(collection(db, "scans"), where("status", "==", "completed"), orderBy("date", "desc"), limit(1));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          setScanRecord({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ScanRecord);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      const unsubscribe = onSnapshot(doc(db, "scans", params.id), (docSnap) => {
        if (docSnap.exists()) {
          setScanRecord({ id: docSnap.id, ...docSnap.data() } as ScanRecord);
        }
        setLoading(false);
      }, (err) => {
        console.error("Scan listener error:", err);
        setLoading(false);
      });
      return () => unsubscribe();
    }
  }, [params.id]);

  const results = useMemo(() => scanRecord?.results || {
    overallScore: 0,
    categoryScores: { presence: 0, descriptionAccuracy: 0, citationStrength: 0, serviceCoverage: 0, competitorShareOfVoice: 0 },
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
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Reconstructing intelligence knowledge graph...</p>
      </div>
    );
  }

  if (!scanRecord) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="p-6 bg-red-50 rounded-full text-red-500">
          <AlertCircle className="w-12 h-12" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-primary">Audit Not Found</h3>
          <p className="text-muted-foreground max-w-xs">The requested audit identifier does not exist in our historical knowledge set.</p>
        </div>
        <Link href="/scans/new">
          <Button className="rounded-full px-8">Run New Audit</Button>
        </Link>
      </div>
    );
  }

  if (scanRecord.status === 'running') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 py-20 animate-in fade-in duration-700">
        <div className="relative">
          <RefreshCcw className="w-16 h-16 text-primary animate-spin opacity-20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap className="w-6 h-6 text-accent animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-4">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-primary tracking-tight">Audit in Progress</h3>
            <p className="text-muted-foreground font-medium">Currently analyzing multi-vector intent signals...</p>
          </div>
          <div className="bg-muted/30 p-4 rounded-2xl border text-left max-w-sm mx-auto space-y-2">
            <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              <span>Diagnostic Ref</span>
              <span>{scanRecord.id.slice(0, 8)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-bold text-primary uppercase">
              <span>Current Step</span>
              <span className="text-accent">{scanRecord.currentStep || "Initializing Pipeline"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (scanRecord.status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 py-20">
        <div className="p-6 bg-destructive/10 rounded-full text-destructive">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <div className="text-center space-y-4 max-w-md">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-primary tracking-tight">Audit Execution Failed</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We encountered a critical model exception during the discovery phase. This is often caused by temporary rate limits on live AI knowledge providers.
            </p>
          </div>
          {scanRecord.errorMessage && (
            <div className="p-4 bg-muted/50 rounded-xl border text-xs font-mono text-muted-foreground text-left break-words">
              Error: {scanRecord.errorMessage}
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <Link href="/scans/new">
              <Button className="rounded-full px-8 bg-primary text-white">Retry Analysis</Button>
            </Link>
            <Button variant="outline" className="rounded-full" onClick={() => window.location.reload()}>Refresh Page</Button>
          </div>
        </div>
      </div>
    );
  }

  const isLowVisibility = results.overallScore < 40;
  const isHighCompetitorThreat = results.categoryScores.competitorShareOfVoice > 50;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-700">
      {/* Dev Debug Panel */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="bg-yellow-50 border-yellow-200 text-yellow-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-yellow-200 px-2 py-1 rounded">DEBUG MODE</div>
            <span>ID: {scanRecord.id}</span>
            <span>Status: {scanRecord.status}</span>
            <span>Step: {scanRecord.currentStep || 'N/A'}</span>
            <span>Results: {scanRecord.results ? 'FOUND' : 'MISSING'}</span>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="bg-white"
            onClick={() => window.location.reload()}
          >
            Refresh Data
          </Button>
        </Card>
      )}

      {/* Executive Report Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
               <FileText className="w-3 h-3 text-accent" />
               Audit Identifier: SCAN-{scanRecord.id.slice(0,8).toUpperCase()}
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
            Subject: <strong className="text-primary font-black">{results.companyName || "Client Account"}</strong> • {results.industry || "Global Market"} • {scanRecord.date?.toDate().toLocaleDateString(undefined, { dateStyle: 'long' })}
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
              </DialogContent>
            </Dialog>
          ) : (
            <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 rounded-full opacity-50 cursor-not-allowed" disabled>
              <Lock className="w-4 h-4" /> Share Access
            </Button>
          )}
          <Link href={`/scans/${scanRecord.id}/report`}>
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 rounded-full px-6">
              <ExternalLink className="w-4 h-4" /> Presentation View
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard title="Overall Visibility" score={results.overallScore} trend={4.2} icon={Search} className="bg-primary text-white" description="Avg. AI prominence" />
        <ScoreCard title="Description Accuracy" score={results.categoryScores.descriptionAccuracy} trend={1.5} icon={ShieldCheck} description="Model alignment" />
        <ScoreCard title="Citation Strength" score={results.categoryScores.citationStrength} trend={8.4} icon={Target} description="Authority sourcing" />
        <ScoreCard title="Service Coverage" score={results.categoryScores.serviceCoverage} trend={-0.8} icon={Zap} description="Indexing depth" />
        <ScoreCard title="Competitor Threat" score={results.categoryScores.competitorShareOfVoice} trend={-2.1} icon={Users} description="Rival prominence" />
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
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
                  <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/30" />
                  <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={364.4} strokeDashoffset={364.4 - (364.4 * (aggregateAccuracy || results.simulationAccuracy || 74)) / 100} className="text-accent transition-all duration-1000 ease-out" strokeLinecap="round" />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-black text-primary">{(aggregateAccuracy || results.simulationAccuracy || 74).toFixed(0)}%</span>
                  <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Fidelity Score</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground px-4 leading-relaxed">Matches real AI responses from Gemini 1.5 Flash knowledge models.</p>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline flex items-center gap-1 mx-auto">
                      <Info className="w-3 h-3" /> Fidelity Methodology
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Simulation Accuracy Methodology</DialogTitle>
                      <DialogDescription className="pt-4 space-y-4">
                        <p>Fidelity Score represents the weighted alignment between VizAI's simulated discovery environment and live responses from Frontier LLMs (Gemini 1.5 Flash).</p>
                        <ul className="list-disc pl-4 space-y-2 text-sm">
                          <li><strong>Entity Overlap:</strong> Cross-referencing mentioned company names.</li>
                          <li><strong>Rank Order:</strong> Comparison of prioritization in recommended lists.</li>
                          <li><strong>Intent Context:</strong> Alignment of descriptive reasoning for entity selection.</li>
                        </ul>
                      </DialogDescription>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
         </Card>

         <Card className="lg:col-span-8 border-none shadow-md bg-white overflow-hidden border-l-4 border-l-accent">
            <CardHeader className="bg-accent/5 py-4 px-8 border-b">
              <CardTitle className="text-lg font-black text-primary flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-accent" />
                Real AI Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid divide-y">
                {validationComparisons.slice(0, 2).map((comp, i) => (
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
          <CardTitle className="text-xl font-black text-primary flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-accent" />
            AI Discovery Opportunities
          </CardTitle>
          <Badge className="bg-accent text-primary font-black px-3 py-1 text-[10px] uppercase tracking-widest">{opportunities.length} Vectors Identified</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-8 font-bold uppercase text-[10px] tracking-widest">Discovery Intent Vector</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest">Captured By Rivals</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">Priority</TableHead>
                  <TableHead className="pr-8 font-bold uppercase text-[10px] tracking-widest text-right">Potential</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((opp) => (
                  <TableRow key={opp.id} className="hover:bg-muted/10 transition-colors group">
                    <TableCell className="pl-8 py-5 font-bold text-primary italic text-xs leading-relaxed">"{opp.query}"</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {opp.competitors.map((comp, i) => <Badge key={i} variant="outline" className="text-[8px] bg-muted/50 border-none">{comp}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={opp.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] uppercase">{opp.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-right pr-8 font-bold text-primary text-[10px]">{opp.potential}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
