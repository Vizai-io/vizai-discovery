
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
  ArrowRight,
  TrendingUp,
  History,
  Activity,
  Calendar,
  Lightbulb
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

const MOCK_TREND_DATA = [
  { name: 'Jan', score: 62 },
  { name: 'Feb', score: 65 },
  { name: 'Mar', score: 64 },
  { name: 'Apr', score: 68 },
  { name: 'May', score: 72 },
  { name: 'Jun', score: 71 },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-primary">Welcome back, Administrator</h2>
          <p className="text-muted-foreground">Here's an overview of your AI visibility profile.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/monitoring">
            <Button variant="outline" className="gap-2 border-primary/20">
              <Activity className="w-4 h-4" />
              Monitoring
            </Button>
          </Link>
          <Link href="/scans/new">
            <Button className="bg-primary hover:bg-primary/90 text-white gap-2">
              <Zap className="w-4 h-4" />
              Launch New Scan
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
          description="Avg. search ranking"
        />
        <ScoreCard 
          title="Description Accuracy" 
          score={88.1} 
          trend={1.5} 
          icon={ShieldCheck} 
          description="Profile match rate"
        />
        <ScoreCard 
          title="Competitor Threat" 
          score={34.2} 
          trend={-2.1} 
          icon={Users} 
          description="Rival share of voice"
        />
        <ScoreCard 
          title="Citation Strength" 
          score={65.5} 
          trend={8.4} 
          icon={Target} 
          description="Authority sourcing"
        />
        <ScoreCard 
          title="Service Coverage" 
          score={54.0} 
          trend={0.8} 
          icon={Zap} 
          description="Category indexing"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-primary">Visibility Trend</CardTitle>
              <CardDescription>Overall AI Visibility score over last 6 months</CardDescription>
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
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 'bold' }}
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
                 <div className="flex gap-1">
                    {[1,1,1,0,1,1,1].map((status, i) => (
                      <div key={i} className={cn("h-6 w-full rounded-sm", status === 1 ? "bg-green-100" : "bg-red-100")} />
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
              <CardTitle className="text-sm font-bold text-primary">Top Actions</CardTitle>
              <Lightbulb className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { title: "Improve Structured Data", priority: "high", desc: "Update JSON-LD schemas." },
                { title: "Add Capabilities Content", priority: "medium", desc: "Publish whitepapers." },
              ].map((rec, i) => (
                <div key={i} className="p-3 bg-muted/50 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-primary">{rec.title}</span>
                    <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">
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
      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold text-primary">Recent Scans</CardTitle>
            <CardDescription>History of your latest AI analyses</CardDescription>
          </div>
          <History className="w-5 h-5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Industry</th>
                  <th className="px-6 py-3">Scan Type</th>
                  <th className="px-6 py-3 text-right">Visibility Score</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { date: "Oct 24, 2023", industry: "SaaS Logistics", type: "Full Ecosystem", score: 72.4, status: "completed" },
                  { date: "Sep 12, 2023", industry: "SaaS Logistics", type: "Quick Scan", score: 68.1, status: "completed" },
                  { date: "Aug 05, 2023", industry: "SaaS Logistics", type: "Full Ecosystem", score: 64.0, status: "completed" },
                ].map((scan, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-primary">{scan.date}</td>
                    <td className="px-6 py-4 text-muted-foreground">{scan.industry}</td>
                    <td className="px-6 py-4 text-muted-foreground">{scan.type}</td>
                    <td className="px-6 py-4 text-right font-bold text-primary">{scan.score}</td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 capitalize">
                        {scan.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/5">View Report</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
