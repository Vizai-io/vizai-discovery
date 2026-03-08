"use client";

import { useState, useEffect, useMemo } from "react";
import { RankingService } from "@/lib/services/ranking-service";
import { RankingSnapshot, RankingEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Globe, 
  Building2, 
  Loader2,
  Medal,
  Search,
  BarChart3,
  Target,
  Users,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Scale
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

export default function RankingsPage() {
  const [snapshot, setSnapshot] = useState<RankingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [industry, setIndustry] = useState("Third Party Logistics (3PL)");
  const [region, setRegion] = useState("Western Europe");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function loadRankings() {
      setLoading(true);
      const data = await RankingService.getLatestRankings(industry, region);
      setSnapshot(data);
      setLoading(false);
    }
    loadRankings();
  }, [industry, region]);

  const filteredEntries = useMemo(() => {
    return snapshot?.entries.filter(entry => 
      entry.companyName.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];
  }, [snapshot, searchTerm]);

  // Executive Benchmarking Logic
  const benchmarks = useMemo(() => {
    if (!snapshot || snapshot.entries.length === 0) return null;
    
    const entries = snapshot.entries;
    const scores = entries.map(e => e.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const topScore = Math.max(...scores);
    
    // Default demo target
    const myEntry = entries.find(e => e.companyName === "Acme Logistics");
    const myScore = myEntry?.score || 0;
    const myRank = myEntry?.rank || entries.length;
    
    // Percentile calculation: (Total - Rank + 1) / Total * 100
    const percentile = ((entries.length - myRank + 1) / entries.length) * 100;

    return {
      avgScore,
      topScore,
      myScore,
      percentile,
      totalCompanies: entries.length,
      isLeader: percentile >= 80,
      isAboveAverage: myScore > avgScore,
      rank: myRank
    };
  }, [snapshot]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Strategic Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">
            <Trophy className="w-3 h-3 text-accent" />
            Market Intelligence • Global Benchmarking
          </div>
          <h2 className="text-3xl font-bold text-primary tracking-tight">Industry Leaderboards</h2>
          <p className="text-muted-foreground mt-1">
            Comparative AI visibility analytics across global verticals.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="border-none bg-transparent focus:ring-0 w-[200px] h-8 p-0 font-medium">
                <SelectValue placeholder="Industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Third Party Logistics (3PL)">3PL Logistics</SelectItem>
                <SelectItem value="SaaS Logistics">SaaS Logistics</SelectItem>
                <SelectItem value="Retail & E-commerce">Retail & E-comm</SelectItem>
                <SelectItem value="Financial Services">FinTech</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="border-none bg-transparent focus:ring-0 w-[150px] h-8 p-0 font-medium">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Western Europe">Western Europe</SelectItem>
                <SelectItem value="North America">North America</SelectItem>
                <SelectItem value="Asia Pacific">Asia Pacific</SelectItem>
                <SelectItem value="Global">Global</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Benchmark Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Industry Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{benchmarks?.avgScore.toFixed(1) || "0.0"}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Mean visibility for this sector</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Top Performer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{benchmarks?.topScore.toFixed(1) || "0.0"}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Maximum achievable signal index</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-primary text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Your Visibility</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{benchmarks?.myScore.toFixed(1) || "0.0"}</div>
            <p className="text-[10px] text-white/50 mt-1">Current Acme Logistics score</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Market Percentile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{benchmarks?.percentile.toFixed(0) || "0"}th</div>
            <p className="text-[10px] text-muted-foreground mt-1">Position vs {benchmarks?.totalCompanies} rivals</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Market Leaders Table */}
        <Card className="lg:col-span-2 border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b bg-muted/10 py-4 px-6">
            <div>
              <CardTitle className="text-lg font-bold text-primary">Sector Leaderboard</CardTitle>
              <CardDescription className="text-xs">
                Performance snapshot for <strong>{industry}</strong> in <strong>{region}</strong>.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Find company..." 
                className="pl-9 h-9 bg-white border-none shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="font-medium">Aggregating market signals...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[80px] text-center font-bold uppercase text-[10px] tracking-widest">Rank</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Organization</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">AI Index</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">Trend</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Classification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.length > 0 ? (
                      filteredEntries.map((entry) => (
                        <TableRow key={entry.companyName} className="hover:bg-muted/20 transition-colors group">
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center font-bold">
                              {entry.rank <= 3 ? (
                                <div className={cn(
                                  "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs shadow-sm",
                                  entry.rank === 1 ? "bg-yellow-500" : entry.rank === 2 ? "bg-slate-400" : "bg-orange-400"
                                )}>
                                  {entry.rank}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">{entry.rank}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-primary group-hover:text-accent transition-colors flex items-center">
                              {entry.companyName}
                              {entry.companyName === "Acme Logistics" && (
                                <Badge className="ml-2 bg-primary/10 text-primary border-none text-[8px] uppercase tracking-widest px-1.5 py-0">You</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-lg font-bold text-primary">
                              {entry.score.toFixed(1)}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center">
                              {entry.change > 0 ? (
                                <div className="flex items-center gap-1 text-green-600 font-bold text-[10px] bg-green-50 px-2 py-1 rounded-full border border-green-100">
                                  <TrendingUp className="w-3 h-3" />
                                  +{entry.change}
                                </div>
                              ) : entry.change < 0 ? (
                                <div className="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-50 px-2 py-1 rounded-full border border-red-100">
                                  <TrendingDown className="w-3 h-3" />
                                  {entry.change}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-muted-foreground font-bold text-[10px] bg-muted/50 px-2 py-1 rounded-full border border-transparent">
                                  <Minus className="w-3 h-3" />
                                  0
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                             <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-2 h-2 rounded-full shadow-sm",
                                  entry.score > 80 ? "bg-green-500" : entry.score > 60 ? "bg-yellow-500" : "bg-red-500"
                                )} />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                  {entry.score > 80 ? "AI Leader" : entry.score > 60 ? "Market Stable" : "Discovery Gap"}
                                </span>
                             </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-48 text-center text-muted-foreground italic">
                          <div className="flex flex-col items-center gap-2">
                            <Search className="w-8 h-8 opacity-20" />
                            No data for current filters.
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How You Compare: Executive Panel */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm bg-gradient-to-br from-[#174C80] to-[#0d2a4a] text-white overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-accent">
                  <BarChart3 className="w-4 h-4" />
                  How You Compare
                </CardTitle>
                <Badge className="bg-white/10 text-white border-white/20 text-[8px] uppercase font-bold tracking-widest">Live Audit</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-white/60">
                    <span>Visibility Index</span>
                    <span>{benchmarks?.myScore.toFixed(1)} / 100</span>
                  </div>
                  <Progress value={benchmarks?.myScore} className="h-1.5 bg-white/10" />
                </div>
                
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3 backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-1.5 rounded-lg shrink-0",
                      benchmarks?.isLeader ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                    )}>
                      {benchmarks?.isLeader ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold">
                        {benchmarks?.isLeader ? "Market Leader Status" : benchmarks?.isAboveAverage ? "Sector Contender" : "Visibility Deficit"}
                      </h4>
                      <p className="text-[10px] opacity-70 leading-relaxed font-medium">
                        {benchmarks?.isLeader 
                          ? "Your brand occupies the top 20th percentile of AI responses. Defensive signaling is recommended to maintain dominance."
                          : benchmarks?.isAboveAverage
                          ? "You are performing above the industry mean. Targeted entity refinement could push you into the Leader tier."
                          : `You are performing in the bottom ${ (100 - (benchmarks?.percentile || 0)).toFixed(0) }th percentile. Significant knowledge gaps identified relative to rivals.`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/10">
                <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Scale className="w-3 h-3" /> Executive Recommendation
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/10 border border-accent/20">
                   <Target className="w-4 h-4 text-accent" />
                   <div className="text-[10px] font-medium leading-relaxed italic">
                     {benchmarks && benchmarks.myScore < benchmarks.avgScore 
                       ? "Prioritize structured entity signals to bridge the gap with industry average discoverability."
                       : "Strengthen authoritative citations to solidify your competitive advantage against rising challengers."}
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                <Medal className="w-3 h-3 text-accent" />
                Top Performers Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-muted/50">
                {snapshot?.entries.slice(0, 3).map((e, i) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-bold text-muted-foreground w-4">#{e.rank}</div>
                      <div className="text-sm font-bold text-primary">{e.companyName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-primary">{e.score.toFixed(1)}</div>
                      <div className="text-[8px] text-muted-foreground uppercase font-bold tracking-tighter">AI Discovery Score</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t bg-muted/20">
                <button className="w-full text-[10px] font-bold text-primary flex items-center justify-center gap-1 uppercase tracking-widest hover:text-accent transition-colors">
                  View Full Sector Report <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
