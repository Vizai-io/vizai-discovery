
"use client";

import { ScoreCard } from "@/components/dashboard/score-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  Target, 
  ShieldCheck, 
  Users, 
  Zap, 
  Activity,
  ArrowRight,
  TrendingUp,
  History,
  Calendar,
  Lightbulb,
  Loader2,
  AlertCircle,
  Trophy,
  Globe,
  BarChart3,
  TrendingDown,
  ArrowUpRight,
  LineChart
} from "lucide-react";
import Link from "next/link";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { ScanRecord } from "@/lib/types";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState<ScanRecord[]>([]);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      try {
        // Fetch more scans to find the first one for progress tracking
        const q = query(
          collection(db, "scans"), 
          where("status", "==", "completed"),
          orderBy("date", "desc"), 
          limit(20)
        );
        const snapshot = await getDocs(q);
        const fetchedScans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScanRecord));
        setScans(fetchedScans);
      } catch (error) {
        console.error("Dashboard error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  const latestScan = useMemo(() => scans[0] || null, [scans]);
  const firstScan = useMemo(() => scans[scans.length - 1] || null, [scans]);

  const progressMetrics = useMemo(() => {
    if (!latestScan || !firstScan || scans.length < 2) return null;

    const totalImprovement = latestScan.results.overallScore - firstScan.results.overallScore;
    
    const categoryImprovements = [
      { 
        label: "Visibility", 
        gain: latestScan.results.categoryScores.presence - firstScan.results.categoryScores.presence,
        icon: Search 
      },
      { 
        label: "Accuracy", 
        gain: latestScan.results.categoryScores.descriptionAccuracy - firstScan.results.categoryScores.descriptionAccuracy,
        icon: ShieldCheck 
      },
      { 
        label: "Citation", 
        gain: latestScan.results.categoryScores.citationStrength - firstScan.results.categoryScores.citationStrength,
        icon: Target 
      },
      { 
        label: "Coverage", 
        gain: latestScan.results.categoryScores.serviceCoverage - firstScan.results.categoryScores.serviceCoverage,
        icon: Zap 
      },
    ];

    return {
      totalImprovement,
      categoryImprovements,
      onboardingDate: firstScan.date?.toDate().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    };
  }, [latestScan, firstScan, scans]);

  const chartData = useMemo(() => {
    return [...scans].reverse().map(s => ({
      name: s.date?.toDate().toLocaleDateString(undefined, { month: 'short' }),
      score: s.results.overallScore
    }));
  }, [scans]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Aggregating intelligence metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-primary">Intelligence Command Center</h2>
          <p className="text-muted-foreground">Strategic overview of your organization's AI discoverability footprint.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/monitoring">
            <Button variant="outline" className="gap-2 border-primary/20">
              <Activity className="w-4 h-4" />
              Monitoring
            </Button>
          </Link>
          <Link href="/scans/new">
            <Button className="bg-primary hover:bg-primary/90 text-white gap-2 shadow-lg shadow-primary/20">
              <Zap className="w-4 h-4" />
              New Scan
            </Button>
          </Link>
        </div>
      </div>

      {/* Discoverability Progress Section */}
      {progressMetrics && (
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">Strategy Insight • Growth Narrative</div>
                <CardTitle className="text-lg font-black tracking-tight flex items-center gap-2 text-primary">
                  <TrendingUp className="w-5 h-5 text-accent" />
                  AI Discoverability Progress
                </CardTitle>
              </div>
              <Badge className="bg-green-50 text-green-700 border-green-200 text-[9px] uppercase font-bold tracking-widest px-2 py-1">
                Onboarded {progressMetrics.onboardingDate}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-4 space-y-4 border-r pr-8">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Total Score Yield</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-primary">+{progressMetrics.totalImprovement.toFixed(1)}</span>
                    <span className="text-sm font-bold text-muted-foreground">Points</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your AI discoverability has improved by <strong>{progressMetrics.totalImprovement.toFixed(1)} points</strong> since your initial audit.
                  </p>
                </div>
                <div className="flex gap-4 pt-2">
                   <div className="space-y-0.5">
                      <div className="text-[9px] font-bold text-muted-foreground uppercase">First Scan</div>
                      <div className="text-lg font-bold text-primary/60">{firstScan?.results.overallScore.toFixed(1)}</div>
                   </div>
                   <ArrowRight className="w-4 h-4 text-muted-foreground mt-6" />
                   <div className="space-y-0.5">
                      <div className="text-[9px] font-bold text-muted-foreground uppercase">Latest Scan</div>
                      <div className="text-lg font-bold text-primary">{latestScan?.results.overallScore.toFixed(1)}</div>
                   </div>
                </div>
              </div>
              <div className="md:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
                {progressMetrics.categoryImprovements.map((cat, i) => (
                  <div key={i} className="p-4 bg-muted/30 rounded-2xl border border-transparent hover:border-primary/10 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                       <cat.icon className="w-4 h-4 text-primary opacity-40" />
                       <div className={cn(
                         "text-[10px] font-bold flex items-center gap-0.5",
                         cat.gain >= 0 ? "text-green-600" : "text-red-500"
                       )}>
                         {cat.gain >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                         {Math.abs(cat.gain).toFixed(1)}
                       </div>
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{cat.label}</div>
                    <div className="text-xl font-black text-primary mt-1">
                      {latestScan?.results.categoryScores[cat.label.toLowerCase().replace(' ', '') as keyof typeof latestScan.results.categoryScores]?.toFixed(0) || "0"}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Market Benchmarking Summary */}
      {latestScan?.results?.benchmark && (
        <Card className="border-none shadow-md bg-gradient-to-br from-[#174C80] to-[#0d2a4a] text-white overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
               <div className="space-y-1">
                 <div className="text-[10px] font-bold text-accent uppercase tracking-[0.2em]">Market Intelligence • Benchmarking</div>
                 <CardTitle className="text-lg font-black tracking-tight">How You Stack Up: {latestScan.results.benchmark.industry}</CardTitle>
               </div>
               <Badge className="bg-white/10 text-white border-white/20 text-[8px] uppercase font-bold tracking-[0.2em] px-2 py-1">
                 Live Sector Comparison
               </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="space-y-1 border-r border-white/10">
                <div className="text-[10px] font-bold text-white/40 uppercase">Industry Average</div>
                <div className="text-3xl font-black text-white/90">{latestScan.results.benchmark.industryAverage.toFixed(1)}</div>
                <div className="text-[9px] text-white/30 font-medium italic">Sector Mean Index</div>
              </div>
              <div className="space-y-1 border-r border-white/10">
                <div className="text-[10px] font-bold text-white/40 uppercase">Top Performer</div>
                <div className="text-3xl font-black text-accent">{latestScan.results.benchmark.topScore.toFixed(1)}</div>
                <div className="text-[9px] text-accent/50 font-medium italic">Max Achieved Signal</div>
              </div>
              <div className="space-y-1 border-r border-white/10">
                <div className="text-[10px] font-bold text-white/40 uppercase">Your Score</div>
                <div className="text-3xl font-black text-white">{latestScan.results.overallScore.toFixed(1)}</div>
                <div className="text-[9px] text-white/30 font-medium italic">Current Visibility Index</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-white/40 uppercase">Percentile Position</div>
                <div className="text-3xl font-black text-white flex items-center gap-2">
                  {latestScan.results.benchmark.percentile}th
                  {latestScan.results.benchmark.percentile >= 75 ? (
                    <Trophy className="w-5 h-5 text-yellow-400" />
                  ) : latestScan.results.benchmark.percentile >= 50 ? (
                    <TrendingUp className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                </div>
                <div className="text-[9px] text-white/30 font-medium italic">Relative to {latestScan.results.benchmark.totalCompanies} rivals</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Primary Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard 
          title="Overall Visibility" 
          score={latestScan?.results?.overallScore || 72.4} 
          trend={latestScan && firstScan ? latestScan.results.overallScore - firstScan.results.overallScore : 0} 
          icon={Search} 
          description="Avg. AI prominence"
          tooltip="Consolidated score based on weighted discovery vectors."
        />
        <ScoreCard 
          title="Description Accuracy" 
          score={latestScan?.results?.categoryScores?.descriptionAccuracy || 88.1} 
          trend={latestScan && firstScan ? latestScan.results.categoryScores.descriptionAccuracy - firstScan.results.categoryScores.descriptionAccuracy : 0} 
          icon={ShieldCheck} 
          description="Model alignment"
          tooltip="Accuracy of AI-generated business summaries."
        />
        <ScoreCard 
          title="Competitor Threat" 
          score={latestScan?.results?.categoryScores?.competitorShareOfVoice || 34.2} 
          trend={latestScan && firstScan ? latestScan.results.categoryScores.competitorShareOfVoice - firstScan.results.categoryScores.competitorShareOfVoice : 0} 
          icon={Users} 
          description="Rival share of voice"
          tooltip="Aggressiveness of competitor recommendations."
        />
        <ScoreCard 
          title="Citation Strength" 
          score={latestScan?.results?.categoryScores?.citationStrength || 65.5} 
          trend={latestScan && firstScan ? latestScan.results.categoryScores.citationStrength - firstScan.results.categoryScores.citationStrength : 0} 
          icon={Target} 
          description="Authority sourcing"
          tooltip="Quality of sources cited by AI models."
        />
        <ScoreCard 
          title="Service Coverage" 
          score={latestScan?.results?.categoryScores?.serviceCoverage || 54.0} 
          trend={latestScan && firstScan ? latestScan.results.categoryScores.serviceCoverage - firstScan.results.categoryScores.serviceCoverage : 0} 
          icon={Zap} 
          description="Category indexing"
          tooltip="Depth of service taxonomy discovery."
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <Card className="lg:col-span-2 border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-primary">Visibility Trend</CardTitle>
              <CardDescription>Historical AI Index Performance</CardDescription>
            </div>
            <LineChart className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.length > 0 ? chartData : [{ name: 'Empty', score: 0 }]}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#174C80" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#174C80" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#174C80' }}
                />
                <Area type="monotone" dataKey="score" stroke="#174C80" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monitoring Card */}
        <div className="space-y-6">
           <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-primary/5 pb-4">
              <div>
                <CardTitle className="text-sm font-bold text-primary">Monitoring Status</CardTitle>
                <CardDescription className="text-[10px]">Active automated tracking</CardDescription>
              </div>
              <Activity className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium">Next Scan</span>
                 </div>
                 <span className="text-xs font-bold text-primary">Oct 28, 2023</span>
              </div>
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium">Frequency</span>
                 </div>
                 <Badge variant="secondary" className="text-[10px]">Weekly</Badge>
              </div>
              <div className="pt-4 border-t">
                 <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Historical Health</div>
                 <div className="flex gap-1.5 h-6">
                    {[1,1,1,1,0,1,1,1,1,1].map((status, i) => (
                      <div 
                        key={i} 
                        className={cn(
                            "flex-1 rounded-[2px] transition-opacity hover:opacity-80", 
                            status === 1 ? "bg-green-50/80" : "bg-red-400/80"
                        )} 
                        title={status === 1 ? "Scan Successful" : "Scan Error Detected"}
                      />
                    ))}
                 </div>
              </div>
              <Link href="/monitoring" className="block w-full">
                <Button variant="ghost" className="w-full text-[10px] uppercase font-bold text-primary hover:bg-primary/5 h-8">
                  Manage Schedules
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold text-primary">Top Recommendations</CardTitle>
              <Lightbulb className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent className="space-y-3">
              {(latestScan?.results?.priorityActions || [
                { title: "Bridge Structured Data Gap", priority: "high", desc: "Update entity schema signals." },
                { title: "Refine Service Taxonomy", priority: "medium", desc: "Expand capability page content." },
              ]).slice(0, 2).map((rec: any, i: number) => (
                <div key={i} className="p-3 bg-muted/50 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-primary leading-tight">{rec.title || rec.action}</span>
                    <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] uppercase px-1.5 h-4 leading-none">
                      {rec.priority}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{rec.description || rec.impact}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Scans Table */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold text-primary">Recent Intelligence Audits</CardTitle>
            <CardDescription>Chronological history of your latest AI analyses</CardDescription>
          </div>
          <History className="w-5 h-5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-0">
          {scans.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                  <tr>
                    <th className="px-6 py-3">Audit Date</th>
                    <th className="px-6 py-3">Organization Context</th>
                    <th className="px-6 py-3 text-right">Visibility Index</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {scans.slice(0, 5).map((scan, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-primary">
                        {scan.date?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-medium">
                        {scan.results?.companyName || "Client Account"}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-primary">
                        {(scan.results?.overallScore || 0).toFixed(1)}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 capitalize text-[10px] h-5">
                          {scan.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/scans/results/${scan.id}`}>
                          <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/5 text-xs font-bold">View Data</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center space-y-4">
              <div className="flex justify-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground/20" />
              </div>
              <p className="text-muted-foreground italic">No historical audits found. Launch a new scan to begin.</p>
              <Link href="/scans/new">
                <Button variant="outline" size="sm">Initiate First Audit</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
