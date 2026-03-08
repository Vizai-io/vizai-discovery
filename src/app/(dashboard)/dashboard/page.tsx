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
  AlertCircle
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
import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import { db } from "@/lib/firebase-config";

const MOCK_TREND_DATA = [
  { name: 'Jan', score: 62 },
  { name: 'Feb', score: 65 },
  { name: 'Mar', score: 64 },
  { name: 'Apr', score: 68 },
  { name: 'May', score: 72 },
  { name: 'Jun', score: 71 },
];

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [recentScans, setRecentScans] = useState<any[]>([]);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      try {
        const q = query(
          collection(db, "scans"), 
          where("status", "==", "completed"),
          orderBy("date", "desc"), 
          limit(5)
        );
        const snapshot = await getDocs(q);
        const scans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRecentScans(scans);
      } catch (error) {
        console.error("Dashboard error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

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

      {/* Primary Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard 
          title="Overall Visibility" 
          score={72.4} 
          trend={4.2} 
          icon={Search} 
          description="Avg. AI prominence"
          tooltip="Consolidated score based on weighted discovery vectors."
        />
        <ScoreCard 
          title="Description Accuracy" 
          score={88.1} 
          trend={1.5} 
          icon={ShieldCheck} 
          description="Model alignment"
          tooltip="Accuracy of AI-generated business summaries."
        />
        <ScoreCard 
          title="Competitor Threat" 
          score={34.2} 
          trend={-2.1} 
          icon={Users} 
          description="Rival share of voice"
          tooltip="Aggressiveness of competitor recommendations."
        />
        <ScoreCard 
          title="Citation Strength" 
          score={65.5} 
          trend={8.4} 
          icon={Target} 
          description="Authority sourcing"
          tooltip="Quality of sources cited by AI models."
        />
        <ScoreCard 
          title="Service Coverage" 
          score={54.0} 
          trend={0.8} 
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
              <CardDescription>Overall AI Index over last 6 months</CardDescription>
            </div>
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_TREND_DATA}>
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
                            status === 1 ? "bg-green-500/80" : "bg-red-400/80"
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
              {[
                { title: "Bridge Structured Data Gap", priority: "high", desc: "Update entity schema signals." },
                { title: "Refine Service Taxonomy", priority: "medium", desc: "Expand capability page content." },
              ].map((rec, i) => (
                <div key={i} className="p-3 bg-muted/50 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-primary">{rec.title}</span>
                    <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] uppercase px-1.5 h-4 leading-none">
                      {rec.priority}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{rec.desc}</p>
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
          {recentScans.length > 0 ? (
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
                  {recentScans.map((scan, i) => (
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