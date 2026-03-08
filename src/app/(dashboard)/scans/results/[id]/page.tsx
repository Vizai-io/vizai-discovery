"use client";

import { ScoreCard } from "@/components/dashboard/score-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
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
  Table as TableIcon,
  Eye,
  EyeOff,
  Lightbulb,
  ArrowUpRight,
  TrendingUp,
  Activity,
  ChevronRight,
  Info,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect } from "react";
import { QueryDiscoveryData, ScanResults } from "@/lib/types";
import { QueryEngine } from "@/lib/services/query-engine";
import { cn } from "@/lib/utils";
import Link from "next/link";

const MOCK_SCORE_BREAKDOWN = [
  { name: 'Presence', score: 78, color: '#174C80' },
  { name: 'Accuracy', score: 88, color: '#14C4E6' },
  { name: 'Citations', score: 65, color: '#0F172A' },
  { name: 'Coverage', score: 54, color: '#64748B' },
  { name: 'Share of Voice', score: 42, color: '#94A3B8' },
];

const MOCK_COMPETITORS = [
  { name: 'You (Acme)', score: 72 },
  { name: 'FedEx', score: 84 },
  { name: 'UPS', score: 79 },
  { name: 'DHL', score: 65 },
];

export default function ScanResultsPage({ params }: { params: { id: string } }) {
  const [queryDiscovery, setQueryDiscovery] = useState<QueryDiscoveryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate data fetch
    setLoading(true);
    QueryEngine.simulateDiscovery(
      "Acme Logistics",
      "Third Party Logistics (3PL)",
      "Western Europe",
      ["FedEx", "UPS", "DHL"]
    ).then((data) => {
      setQueryDiscovery(data);
      setLoading(false);
    });
  }, []);

  // Mock Findings and Actions for demonstration
  const KEY_FINDINGS = [
    { title: "Inaccurate Service Taxonomy", desc: "LLMs frequently fail to categorize your 'Cold Chain' services correctly, often defaulting to general logistics.", severity: "high" },
    { title: "Weak Sourcing Citations", desc: "Your official documentation is rarely cited as a primary source compared to 3rd party industry blogs.", severity: "medium" },
    { title: "Regional Visibility Gap", desc: "Presence in DACH region queries is 40% lower than your competitors despite local operations.", severity: "high" },
    { title: "Competitor Hijack", desc: "FedEx is consistently listed first for 'Logistics innovations' queries where your recent whitepaper should rank.", severity: "medium" }
  ];

  const PRIORITY_ACTIONS = [
    { action: "Deploy JSON-LD Entity Schema", impact: "High", timeline: "1-2 Weeks", icon: Activity },
    { action: "Publish AI-Ready Capabilities Page", impact: "High", timeline: "3-4 Weeks", icon: Zap },
    { action: "Aggressive Citation Building (LinkedIn/TechCrunch)", impact: "Medium", timeline: "Ongoing", icon: Target },
    { action: "Update Knowledge Layer API", impact: "Medium", timeline: "2 Months", icon: ShieldCheck }
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Executive Report Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
             <FileText className="w-3 h-3 text-accent" />
             Report ID: {params.id === 'latest' ? 'SCAN-1024-X' : params.id} • Confidential
          </div>
          <h2 className="text-4xl font-headline font-bold text-primary tracking-tight">Executive Discovery Report</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            Analysis for <strong className="text-primary font-bold">Acme Logistics</strong> • Western Europe Market • Oct 24, 2023
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5">
            <Share2 className="w-4 h-4" /> Share Dashboard
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
          title="AI Visibility Index" 
          score={72.4} 
          trend={4.2} 
          icon={Search} 
          className="bg-primary text-white" 
          description="Aggregated score across 4 providers"
        />
        <ScoreCard 
          title="Description Accuracy" 
          score={88.1} 
          trend={1.5} 
          icon={ShieldCheck} 
          description="Business model alignment"
        />
        <ScoreCard 
          title="Citation Strength" 
          score={65.5} 
          trend={8.4} 
          icon={Target} 
          description="Authority of data sources"
        />
        <ScoreCard 
          title="Service Coverage" 
          score={54.0} 
          trend={-0.8} 
          icon={Zap} 
          description="Completeness of offerings"
        />
        <ScoreCard 
          title="Competitor Threat" 
          score={34.2} 
          trend={-2.1} 
          icon={Users} 
          description="Rival share of search voice"
        />
      </div>

      {/* Findings & Actions Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Key Findings */}
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 py-4 px-6">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-accent" />
                Key Diagnostic Findings
              </CardTitle>
              <CardDescription className="text-xs">Critical issues impacting your visibility</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {KEY_FINDINGS.map((finding, i) => (
                <div key={i} className="p-6 flex gap-4 hover:bg-muted/10 transition-colors">
                  <div className={cn(
                    "w-2 h-2 rounded-full mt-2 shrink-0",
                    finding.severity === 'high' ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                  )} />
                  <div className="space-y-1">
                    <h4 className="font-bold text-primary text-sm">{finding.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{finding.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Priority Actions */}
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-primary/5 py-4 px-6">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-accent" />
                Strategic Next Steps
              </CardTitle>
              <CardDescription className="text-xs">Recommended sequence for optimization</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {PRIORITY_ACTIONS.map((action, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-transparent hover:border-accent/20 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-primary shadow-sm group-hover:bg-accent group-hover:text-white transition-colors">
                      <action.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-primary">{action.action}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Timeline: {action.timeline}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 uppercase text-[8px] px-2 py-0">
                      Impact: {action.impact}
                    </Badge>
                  </div>
                </div>
              ))}
              <Button variant="ghost" className="w-full text-primary hover:text-primary hover:bg-primary/5 text-xs font-bold gap-2">
                View Full Technical Implementation Plan
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Query Discovery Analysis */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b py-6 px-8">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-accent" />
              Discovery Signal Coverage
            </CardTitle>
            <CardDescription>Performance benchmark across 24 simulated buyer intents</CardDescription>
          </div>
          <div className="flex items-center gap-8 pr-4">
            <div className="text-center">
              <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Total Mentions</div>
              <div className="text-2xl font-bold text-primary">{queryDiscovery?.summary.companyMentionCount || 0}</div>
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
                  <TableHead className="w-[40%] pl-8 font-bold uppercase text-[10px] tracking-widest text-muted-foreground">User Query Vector</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Provider Distribution</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Market Share / Mentions</TableHead>
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
                            <Eye className="w-3 h-3" /> Mentioned
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold uppercase">
                            <EyeOff className="w-3 h-3" /> Absent
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

      {/* Detail Analysis Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Description Analysis */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-accent" />
              AI Conceptual Match
            </CardTitle>
            <CardDescription className="text-xs">How AI interprets your core value prop</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-muted-foreground uppercase">Alignment Score</div>
                <div className="text-3xl font-bold text-primary">88%</div>
              </div>
              <div className="w-16 h-16 rounded-full border-4 border-accent/20 border-t-accent flex items-center justify-center text-xs font-bold text-primary">
                High
              </div>
            </div>
            
            <div className="space-y-4 pt-2">
               <div className="p-3 bg-green-50/50 rounded-lg border border-green-100 flex gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-green-800 leading-relaxed font-medium">Core service taxonomy (3PL, Logistics) is accurately mapped across all providers.</div>
               </div>
               <div className="p-3 bg-yellow-50/50 rounded-lg border border-yellow-100 flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-yellow-800 leading-relaxed font-medium">Secondary 'Subscription Logistics' tier is missing in 60% of LLM descriptions.</div>
               </div>
            </div>
          </CardContent>
        </Card>

        {/* Competitor Analysis */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <Users className="w-5 h-5 text-accent" />
              Market Discovery Share
            </CardTitle>
            <CardDescription className="text-xs">Your presence relative to top rivals</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[200px] w-full mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={MOCK_COMPETITORS}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="score"
                    stroke="none"
                  >
                    {MOCK_COMPETITORS.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#174C80' : '#E2E8F0'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="text-2xl font-bold text-primary">31%</div>
                <div className="text-[8px] font-bold text-muted-foreground uppercase">Share</div>
              </div>
            </div>
            <div className="space-y-2">
               {MOCK_COMPETITORS.map((c, i) => (
                 <div key={i} className="flex justify-between items-center p-2 rounded-lg hover:bg-muted/30 transition-colors">
                    <span className="flex items-center gap-2 text-xs font-medium text-primary">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: i === 0 ? '#174C80' : '#CBD5E1' }} />
                       {c.name}
                    </span>
                    <span className="text-xs font-bold text-primary">{c.score}%</span>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>

        {/* Missed Discovery Detail */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-accent" />
              Lost Opportunities
            </CardTitle>
            <CardDescription className="text-xs">Where competitors are owning the narrative</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
             {queryDiscovery?.queries.filter(q => !q.results.some(r => r.isTargetCompanyMentioned)).slice(0, 3).map((q, i) => (
               <div key={i} className="space-y-2 pb-4 border-b last:border-0 last:pb-0">
                  <div className="text-xs font-bold text-primary italic leading-tight">"{q.text}"</div>
                  <div className="flex flex-wrap gap-1">
                    {q.results[0].mentions.map((m, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[8px] px-1.5 py-0 bg-red-50 text-red-700 border-red-100">
                        {m.companyName}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-[9px] font-bold text-green-600 flex items-center gap-1 uppercase">
                    <TrendingUp className="w-3 h-3" />
                    Strategic Fix: Update regional capability content
                  </div>
               </div>
             ))}
             {(!queryDiscovery || queryDiscovery.queries.every(q => q.results.some(r => r.isTargetCompanyMentioned))) && (
               <div className="p-12 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-500">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-muted-foreground italic">No significant discovery gaps found in this vector set.</p>
               </div>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
