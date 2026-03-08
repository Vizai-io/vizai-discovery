
"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { ScanRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  History, 
  TrendingUp, 
  TrendingDown, 
  Loader2, 
  LineChart,
  Calendar,
  Search,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Activity,
  Filter
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
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        const q = query(collection(db, "scans"), orderBy("date", "desc"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScanRecord));
        setScans(data);
      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const chartData = useMemo(() => {
    return [...scans].reverse().map(s => ({
      name: s.date?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      score: s.results?.overallScore || 0
    }));
  }, [scans]);

  const stats = useMemo(() => {
    if (scans.length < 2) return null;
    const latest = scans[0].results.overallScore;
    const previous = scans[1].results.overallScore;
    const drift = latest - previous;
    
    return {
      latest,
      drift,
      avg: scans.reduce((acc, s) => acc + (s.results.overallScore || 0), 0) / scans.length,
      totalScans: scans.length
    };
  }, [scans]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium uppercase tracking-[0.2em] text-[10px] font-bold">Aggregating Chronological Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <History className="w-8 h-8 text-accent" />
            Intelligence Timeline
          </h2>
          <p className="text-muted-foreground italic">Track visibility drift and historical discoverability performance across all audit cycles.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 border-primary/10 h-10 font-bold text-[10px] uppercase tracking-widest rounded-full">
            <Filter className="w-3.5 h-3.5" /> Filter Date Range
          </Button>
          <Link href="/scans/new">
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 rounded-full shadow-lg">New Audit</Button>
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Trend Visualization */}
        <Card className="lg:col-span-8 border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/10 py-4 px-8">
            <div className="space-y-1">
              <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
                <LineChart className="w-4 h-4 text-accent" />
                Visibility Performance Curve
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Aggregate Portfolio Trend</CardDescription>
            </div>
            {stats && (
              <Badge variant="outline" className={cn(
                "h-6 px-3 text-[10px] font-black uppercase tracking-widest",
                stats.drift >= 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
              )}>
                {stats.drift >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {Math.abs(stats.drift).toFixed(1)} Drift
              </Badge>
            )}
          </CardHeader>
          <CardContent className="h-[350px] pt-8 px-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.length > 0 ? chartData : [{ name: 'Empty', score: 0 }]}>
                <defs>
                  <linearGradient id="colorHistory" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#174C80" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#174C80" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#174C80', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="score" stroke="#174C80" strokeWidth={4} fillOpacity={1} fill="url(#colorHistory)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Drift Summary Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-primary text-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 transition-transform duration-700 group-hover:scale-125" />
            <CardHeader className="pb-2 border-b bg-white/5 px-6">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-white/60">Portfolio Yield</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 px-6 space-y-6">
              <div className="space-y-1">
                <div className="text-5xl font-black tracking-tighter text-accent">{stats?.avg.toFixed(1) || "0.0"}</div>
                <div className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em]">Median Visibility Index</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div className="space-y-1">
                  <div className="text-xl font-bold">{stats?.totalScans || 0}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">Total Audits</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xl font-bold text-green-400">Stable</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">System Health</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="pb-2 border-b bg-muted/10 px-6">
              <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Recent Shifts</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-muted/50">
                {scans.slice(0, 4).map((scan, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-primary truncate max-w-[120px]">{scan.results?.companyName || "Audit Record"}</div>
                        <div className="text-[8px] text-muted-foreground font-medium">{scan.date?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-primary">{scan.results?.overallScore.toFixed(1)}</div>
                      <Badge variant="outline" className="text-[7px] font-black h-3 px-1 border-primary/10">Verified</Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t bg-muted/10">
                <Link href="/scans">
                  <Button variant="ghost" className="w-full text-[9px] font-bold uppercase tracking-widest h-8 text-primary hover:bg-primary/5">
                    View Full Inventory <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
