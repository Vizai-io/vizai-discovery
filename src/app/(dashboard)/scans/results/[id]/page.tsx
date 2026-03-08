
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
  Loader2,
  ArrowRight,
  ShieldAlert,
  ArrowUpRight,
  GitCompare,
  Radar,
  FileSearch,
  Lock,
  Copy,
  AlertCircle,
  Sparkles
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
import { use, useState, useEffect, useMemo } from "react";
import { StrategicRecommendation, ScanResults, ScanRecord } from "@/lib/types";
import { AIResponseParser } from "@/lib/services/ai-response-parser";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { calculateProjectedImprovement } from "@/lib/services/scoring-model";
import { toast } from "@/hooks/use-toast";
import { ConsultationRequestDialog } from "@/components/consultation/consultation-request-dialog";

export default function ScanResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scanRecord, setScanRecord] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
      setLoading(true);
      try {
        if (id === 'latest') {
          const scansRef = collection(db, "scans");
          const q = query(scansRef, where("status", "==", "completed"), orderBy("date", "desc"), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setScanRecord({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ScanRecord);
          }
        } else {
          const docRef = doc(db, "scans", id);
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
  }, [id]);

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

  const isLowVisibility = results.overallScore < 40;
  const isHighCompetitorThreat = results.categoryScores.competitorShareOfVoice > 50;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-700">
      {/* Executive Report Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
               <FileText className="w-3 h-3 text-accent" />
               Report Identifier: {id === 'latest' ? 'SCAN-LATEST' : `SCAN-${id.slice(0,8).toUpperCase()}`}
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
          <Link href={`/scans/report/${id}`}>
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 rounded-full px-6">
              <ExternalLink className="w-4 h-4" /> Presentation View
            </Button>
          </Link>
        </div>
      </div>

      {/* Critical CTA Interventions */}
      {isLowVisibility && (
        <Card className="border-none shadow-lg bg-destructive/5 border-l-4 border-l-destructive overflow-hidden">
          <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold text-destructive">Critical Visibility Deficit Detected</CardTitle>
                <p className="text-sm text-muted-foreground font-medium">Your organization is largely invisible to primary AI discovery vectors. Strategic optimization is required.</p>
              </div>
            </div>
            <ConsultationRequestDialog 
              sourceScanId={scanRecord?.id} 
              trigger={
                <Button className="bg-destructive hover:bg-destructive/90 text-white font-bold px-8 rounded-full h-12 shadow-lg shadow-destructive/20 gap-2">
                  Request Emergency Optimization Plan <ArrowRight className="w-4 h-4" />
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Metric Pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard title="Overall Visibility" score={results.overallScore} trend={4.2} icon={Search} className="bg-primary text-white" description="Avg. AI prominence" />
        <ScoreCard title="Description Accuracy" score={results.categoryScores.descriptionAccuracy} trend={1.5} icon={ShieldCheck} description="Model alignment" />
        <ScoreCard title="Citation Strength" score={results.categoryScores.citationStrength} trend={8.4} icon={Target} description="Authority sourcing" />
        <ScoreCard title="Service Coverage" score={results.categoryScores.serviceCoverage} trend={-0.8} icon={Zap} description="Indexing depth" />
        <ScoreCard title="Competitor Threat" score={results.categoryScores.competitorShareOfVoice} trend={-2.1} icon={Users} description="Rival prominence" />
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
                  <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/30" />
                  <circle
                    cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent"
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
            </CardContent>
         </Card>

         {/* Real AI Validation Table */}
         <Card className="lg:col-span-8 border-none shadow-md bg-white overflow-hidden border-l-4 border-l-accent">
            <CardHeader className="flex flex-row items-center justify-between bg-accent/5 py-4 px-8">
              <CardTitle className="text-lg font-black text-primary flex items-center gap-2 tracking-tight">
                <GitCompare className="w-5 h-5 text-accent" /> Real AI Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid divide-y">
                {(validationComparisons.length > 0 ? validationComparisons : []).slice(0, 2).map((comp, i) => (
                  <div key={i} className="p-6 grid md:grid-cols-12 gap-6">
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
                  </div>
                ))}
              </div>
            </CardContent>
         </Card>
      </div>
    </div>
  );
}
