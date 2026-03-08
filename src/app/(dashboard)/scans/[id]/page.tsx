
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
  AlertCircle,
  RefreshCcw,
  Info,
  CheckCircle2
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
import { cn } from "@/lib/utils";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { toast } from "@/hooks/use-toast";

export default function ScanResultsPage({ params }: { params: { id: string } }) {
  const [scanRecord, setScanRecord] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [params.id]);

  const results = useMemo(() => scanRecord?.results || {
    overallScore: 0,
    categoryScores: { presence: 0, descriptionAccuracy: 0, citationStrength: 0, serviceCoverage: 0, competitorShareOfVoice: 0 },
    priorityActions: [] as StrategicRecommendation[]
  } as ScanResults, [scanRecord]);

  const queryDiscovery = useMemo(() => scanRecord?.queryDiscovery || null, [scanRecord]);

  const opportunities = useMemo(() => {
    if (!queryDiscovery) return [];
    return queryDiscovery.queries
      .filter(q => !q.results.some(r => r.isTargetCompanyMentioned))
      .map(q => ({
        id: q.id,
        query: q.text,
        competitors: Array.from(new Set(q.results.flatMap(r => r.mentions.map(m => m.companyName)))),
        category: q.category || 'Intent Vector',
        priority: q.intentType === 'best' ? 'high' : 'medium',
        potential: 'Significant Visibility Uplift'
      }));
  }, [queryDiscovery]);

  const copyShareLink = () => {
    const url = `${window.location.origin}/share/${scanRecord?.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Copied" });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Hydrating Intelligence Graph...</p>
      </div>
    );
  }

  if (!scanRecord) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="p-6 bg-red-50 rounded-full text-red-500"><AlertCircle className="w-12 h-12" /></div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-primary">Audit Identifier Not Found</h3>
          <p className="text-muted-foreground max-w-xs">The requested audit record is missing from the intelligence layer.</p>
        </div>
        <Link href="/scans/new"><Button className="rounded-full px-8">Run New Audit</Button></Link>
      </div>
    );
  }

  if (scanRecord.status === 'running') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 py-20">
        <RefreshCcw className="w-16 h-16 text-primary animate-spin opacity-20" />
        <div className="text-center space-y-4">
          <h3 className="text-2xl font-black text-primary tracking-tight">Audit in Progress</h3>
          <p className="text-muted-foreground">Writing deterministic signals to intelligence graph...</p>
          <div className="bg-muted/30 p-4 rounded-2xl border text-xs font-mono max-w-sm mx-auto text-left">
            ID: {scanRecord.id}<br/>
            Step: {scanRecord.currentStep || "Minimal Path Execution"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-700">
      {/* Developer Diagnostic Panel */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="bg-amber-50 border-amber-200 text-amber-900 p-4 flex items-center justify-between shadow-sm">
          <div className="flex flex-wrap gap-6 items-center text-[10px] font-mono font-bold uppercase">
            <div className="bg-amber-200 px-2 py-1 rounded">Diagnostic Hub</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-600" /> Result Doc: YES</div>
            <div>ID: {scanRecord.id}</div>
            <div>Status: {scanRecord.status}</div>
            <div>Path: scans/{params.id}</div>
          </div>
          <Button size="xs" variant="outline" className="bg-white text-[10px] h-7" onClick={() => window.location.reload()}>Refresh Path</Button>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
             <FileText className="w-3 h-3 text-accent" /> Audit Identifier: SCAN-{scanRecord.id.slice(0,8).toUpperCase()}
          </div>
          <h2 className="text-4xl font-headline font-black text-primary tracking-tighter">Discovery Intelligence Audit</h2>
          <p className="text-muted-foreground">Subject: <strong className="text-primary">{results.companyName || "Client Account"}</strong> • {results.industry || "General"}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="rounded-full gap-2" onClick={copyShareLink}><Share2 className="w-4 h-4" /> Share</Button>
          <Link href={`/scans/${scanRecord.id}/report`}><Button className="bg-primary text-white rounded-full px-6 gap-2">Presentation View <ExternalLink className="w-4 h-4" /></Button></Link>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard title="Overall Visibility" score={results.overallScore} trend={4.2} icon={Search} className="bg-primary text-white" description="Avg. AI prominence" />
        <ScoreCard title="Description Accuracy" score={results.categoryScores.descriptionAccuracy} trend={1.5} icon={ShieldCheck} description="Model alignment" />
        <ScoreCard title="Citation Strength" score={results.categoryScores.citationStrength} trend={8.4} icon={Target} description="Authority sourcing" />
        <ScoreCard title="Service Coverage" score={results.categoryScores.serviceCoverage} trend={-0.8} icon={Zap} description="Indexing depth" />
        <ScoreCard title="Competitor Threat" score={results.categoryScores.competitorShareOfVoice} trend={-2.1} icon={Users} description="Rival prominence" />
      </div>

      {/* Discovery Opportunities */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 py-4 px-8 border-b">
          <CardTitle className="text-xl font-black text-primary flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-accent" /> AI Discovery Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="pl-8 font-bold uppercase text-[10px] tracking-widest">Intent Vector</TableHead>
                <TableHead className="font-bold uppercase text-[10px] tracking-widest">Dominant Rivals</TableHead>
                <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">Priority</TableHead>
                <TableHead className="pr-8 font-bold uppercase text-[10px] tracking-widest text-right">Potential</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((opp) => (
                <TableRow key={opp.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="pl-8 py-5 font-bold text-primary italic text-xs">"{opp.query}"</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {opp.competitors.map((comp, i) => <Badge key={i} variant="outline" className="text-[8px] border-none bg-muted/50">{comp}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="text-center"><Badge variant={opp.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] uppercase">{opp.priority}</Badge></TableCell>
                  <TableCell className="text-right pr-8 font-bold text-primary text-[10px]">{opp.potential}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
