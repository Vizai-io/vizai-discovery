
"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { ScanRecord, StrategicRecommendation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Lightbulb, 
  Zap, 
  Target, 
  TrendingUp, 
  ShieldCheck, 
  Layers,
  ArrowRight,
  Loader2,
  AlertCircle,
  FileSearch,
  Sparkles,
  ChevronRight,
  Activity,
  Search
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function RecommendationsPage() {
  const [latestScan, setLatestScan] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLatestScan() {
      setLoading(true);
      try {
        const q = query(
          collection(db, "scans"), 
          where("status", "==", "completed"),
          orderBy("date", "desc"), 
          limit(1)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setLatestScan({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ScanRecord);
        }
      } catch (error) {
        console.error("Error fetching recommendations:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchLatestScan();
  }, []);

  const recommendations = useMemo(() => {
    if (!latestScan) return [];
    return latestScan.results.priorityActions || [];
  }, [latestScan]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium uppercase tracking-[0.2em] text-[10px] font-bold">Synthesizing Strategic Roadmap...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Lightbulb className="w-8 h-8 text-accent" />
            Strategic Action Center
          </h2>
          <p className="text-muted-foreground italic">Prioritized interventions to improve AI visibility and entity authority.</p>
        </div>
        {latestScan && (
          <Badge className="bg-accent/10 text-primary border-accent/20 text-[10px] font-bold uppercase tracking-widest px-3 py-1">
            Based on: AUDIT-{latestScan.id.slice(0,8).toUpperCase()}
          </Badge>
        )}
      </div>

      {!latestScan ? (
        <Card className="border-dashed border-2 py-24 text-center space-y-6 bg-muted/10">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
            <Target className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div className="space-y-2 max-w-sm mx-auto px-6">
            <h3 className="text-xl font-bold text-primary">No Intelligence Found</h3>
            <p className="text-sm text-muted-foreground italic">Run a visibility scan to generate custom strategic recommendations for your organization.</p>
          </div>
          <Link href="/scans/new">
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-12 px-8 rounded-full shadow-lg">Start Discovery Scan</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Executive Overview Card */}
          <Card className="border-none shadow-xl bg-gradient-to-br from-[#174C80] to-[#0d2a4a] text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="p-10 relative z-10 grid md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-8 space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-accent uppercase tracking-[0.3em]">
                  <Sparkles className="w-4 h-4" /> Strategy Briefing
                </div>
                <h3 className="text-3xl font-black tracking-tighter leading-none">Intelligence-Driven Optimization</h3>
                <p className="text-white/70 leading-relaxed text-sm max-w-lg">
                  Following the latest multi-vector audit, we have identified {recommendations.length} critical workstreams to bridge existing discoverability gaps. Priority is given to high-yield entity signal refinements.
                </p>
                <div className="pt-4">
                  <Link href={`/scans/results/${latestScan.id}`}>
                    <Button variant="outline" className="text-white border-white/20 hover:bg-white/10 rounded-full font-bold text-[10px] uppercase tracking-widest gap-2">
                      View Raw Audit Data <ChevronRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="md:col-span-4 bg-white/5 border border-white/10 p-6 rounded-3xl text-center space-y-2 backdrop-blur-md">
                <div className="text-[10px] font-bold uppercase text-white/40 tracking-widest">Visibility Index</div>
                <div className="text-6xl font-black text-accent tracking-tighter">{latestScan.results.overallScore.toFixed(1)}</div>
                <div className="text-[10px] font-bold text-green-400 uppercase tracking-tighter italic">Sector Contender</div>
              </div>
            </CardContent>
          </Card>

          {/* Action List */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] flex items-center gap-2">
              <Zap className="w-3 h-3 text-accent" /> Prioritized Strategic Interventions
            </h4>
            
            <div className="grid gap-6">
              {recommendations.map((rec, i) => (
                <Card key={i} className="border-none shadow-sm hover:shadow-lg transition-all duration-500 bg-white overflow-hidden border-l-4 border-l-primary group">
                  <CardContent className="p-8">
                    <div className="flex flex-col sm:flex-row items-start gap-8">
                      <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-sm font-black text-xl text-primary">
                        {i + 1}
                      </div>
                      <div className="space-y-4 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge className="bg-accent/10 text-primary border-none text-[9px] uppercase font-bold tracking-widest h-5">
                            {rec.category}
                          </Badge>
                          <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-[9px] uppercase font-bold h-5 px-2">
                            {rec.priority} Priority
                          </Badge>
                          {rec.packageType && (
                            <Badge variant="outline" className="text-[9px] font-bold h-5 px-2 border-primary/10 text-muted-foreground">
                              Tier: {rec.packageType}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <h5 className="text-xl font-bold text-primary tracking-tight leading-tight group-hover:text-accent transition-colors">{rec.title}</h5>
                          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl font-medium">
                            {rec.description}
                          </p>
                        </div>

                        <div className="pt-4 flex flex-col sm:flex-row sm:items-center gap-6">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-green-50 text-green-600">
                              <TrendingUp className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest leading-none">Expected Outcome</div>
                              <div className="text-[10px] font-bold text-primary uppercase">{rec.expectedImpact}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                              <Layers className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest leading-none">Technical Domain</div>
                              <div className="text-[10px] font-bold text-primary uppercase">{rec.category === 'Structured Data' ? 'Signal Engineering' : 'Content Authority'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="sm:self-center">
                        <Link href={`/admin/scans/${latestScan.id}/proposal`}>
                          <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/5 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRight className="w-5 h-5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Footer CTA */}
          <div className="p-8 bg-muted/30 rounded-[2.5rem] border border-dashed flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-1 text-center md:text-left">
              <h5 className="text-lg font-bold text-primary">Need technical implementation?</h5>
              <p className="text-sm text-muted-foreground font-medium">Our strategy team can help deploy these high-yield entity signals.</p>
            </div>
            <Link href="/monitoring">
              <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-12 px-8 rounded-full shadow-lg gap-2">
                <Activity className="w-4 h-4" /> Manage Execution Plan
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
