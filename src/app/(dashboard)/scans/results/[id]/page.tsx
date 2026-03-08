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
  Download, 
  Share2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Table as TableIcon,
  Eye,
  EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect } from "react";
import { QueryDiscoveryData } from "@/lib/types";
import { QueryEngine } from "@/lib/services/query-engine";

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

  useEffect(() => {
    // Generate mock discovery data on mount
    QueryEngine.simulateDiscovery(
      "Acme Logistics",
      "Third Party Logistics (3PL)",
      "Western Europe",
      ["FedEx", "UPS", "DHL"]
    ).then(setQueryDiscovery);
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Report Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
             <FileText className="w-3 h-3" />
             Report ID: {params.id === 'latest' ? 'SCAN-1024-X' : params.id}
          </div>
          <h2 className="text-3xl font-bold text-primary">AI Visibility Analysis</h2>
          <p className="text-muted-foreground">Conducted on October 24, 2023 for <strong>Acme Logistics</strong></p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Share2 className="w-4 h-4" /> Share
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Hero Scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard title="Overall Score" score={72.4} icon={Search} className="lg:bg-primary lg:text-white" />
        <ScoreCard title="Presence" score={78.0} icon={Search} />
        <ScoreCard title="Accuracy" score={88.1} icon={ShieldCheck} />
        <ScoreCard title="Citations" score={65.5} icon={Target} />
        <ScoreCard title="Market Share" score={31.2} icon={Users} />
      </div>

      {/* Query Discovery Section */}
      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold text-primary">Query Discovery & AI Simulations</CardTitle>
            <CardDescription>Simulated user queries and AI mentions (Multi-Provider)</CardDescription>
          </div>
          <TableIcon className="w-5 h-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <div className="bg-muted/30 p-4 rounded-xl text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Total Queries</div>
              <div className="text-2xl font-bold text-primary">{queryDiscovery?.summary.totalQueries || 0}</div>
            </div>
            <div className="bg-muted/30 p-4 rounded-xl text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Your Mentions</div>
              <div className="text-2xl font-bold text-primary">{queryDiscovery?.summary.companyMentionCount || 0}</div>
            </div>
            <div className="bg-muted/30 p-4 rounded-xl text-center md:col-span-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-xs font-bold text-muted-foreground uppercase">Query Coverage</span>
                <span className="text-xs font-bold text-primary">{queryDiscovery?.summary.coveragePercentage.toFixed(1) || 0}%</span>
              </div>
              <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-1000" 
                  style={{ width: `${queryDiscovery?.summary.coveragePercentage || 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[40%]">Industry Query</TableHead>
                  <TableHead>Providers</TableHead>
                  <TableHead>Top Mentions</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queryDiscovery?.queries.map((q) => {
                   const isMentioned = q.results.some(r => r.isTargetCompanyMentioned);
                   const topMentions = q.results[0]?.mentions.slice(0, 3).map(m => m.companyName).join(", ");
                   
                   return (
                    <TableRow key={q.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium italic">"{q.text}"</TableCell>
                      <TableCell>
                        <div className="flex -space-x-1">
                          {q.results.map((r, i) => (
                            <div 
                              key={i} 
                              className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm`}
                              style={{ backgroundColor: r.isTargetCompanyMentioned ? '#14C4E6' : '#64748B' }}
                              title={`${r.provider}: ${r.isTargetCompanyMentioned ? 'Mentioned' : 'Not Mentioned'}`}
                            >
                              {r.provider[0]}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {topMentions}...
                      </TableCell>
                      <TableCell className="text-center">
                        {isMentioned ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                            <Eye className="w-3 h-3" /> Found
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                            <EyeOff className="w-3 h-3" /> Missed
                          </Badge>
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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Category Performance (Existing) */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Category Performance</CardTitle>
            <CardDescription>Weight against benchmarks</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_SCORE_BREAKDOWN} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis dataKey="name" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip 
                   cursor={{fill: 'transparent'}}
                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20}>
                  {MOCK_SCORE_BREAKDOWN.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* AI Description Accuracy (Existing) */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">AI Description Match</CardTitle>
            <CardDescription>Does AI understand your business?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted/30 rounded-xl border space-y-3">
               <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Accuracy Score</span>
                  <span className="text-lg font-bold text-primary">88%</span>
               </div>
               <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-accent w-[88%]" />
               </div>
            </div>
            
            <div className="space-y-3">
               <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                  <div className="text-xs text-muted-foreground">AI correctly identified you as a 3PL provider for Western Europe.</div>
               </div>
               <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div className="text-xs text-muted-foreground">LLMs failed to mention your new "Subscription Logistics" tier.</div>
               </div>
            </div>
          </CardContent>
        </Card>

        {/* Competitor Threat (Existing) */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Competitor Benchmarking</CardTitle>
            <CardDescription>Relative AI discoverability</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={MOCK_COMPETITORS}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="score"
                >
                  {MOCK_COMPETITORS.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#174C80' : '#E2E8F0'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
               {MOCK_COMPETITORS.map((c, i) => (
                 <div key={i} className="flex justify-between items-center text-[10px]">
                    <span className="flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i === 0 ? '#174C80' : '#CBD5E1' }} />
                       {c.name}
                    </span>
                    <span className="font-bold text-primary">{c.score}</span>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Knowledge Gaps */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Technical Knowledge Gaps</CardTitle>
            <CardDescription>Missing signals for LLM ingestion</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { type: 'Structured Data', gap: 'Missing JSON-LD localBusiness schema', impact: 'Reduced regional discovery in local-intent queries.' },
              { type: 'Content', gap: 'No publicly available API documentation', impact: 'AI cannot explain technical integration capabilities.' },
              { type: 'Citations', gap: 'Lack of verified reviews on neutral platforms', impact: 'LLMs hesitate to recommend you as a leader.' },
            ].map((g, i) => (
              <div key={i} className="flex gap-4 p-4 hover:bg-muted/30 transition-colors rounded-xl border border-transparent hover:border-border">
                 <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                 </div>
                 <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">{g.type}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Priority High</span>
                    </div>
                    <p className="text-sm font-bold text-primary/80">{g.gap}</p>
                    <p className="text-xs text-muted-foreground">{g.impact}</p>
                 </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Missed Opportunities - Improved based on Query Data */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Missed Discovery Opportunities</CardTitle>
            <CardDescription>Queries where you were absent from AI results</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             {queryDiscovery?.queries.filter(q => !q.results.some(r => r.isTargetCompanyMentioned)).slice(0, 3).map((q, i) => (
               <div key={i} className="p-4 bg-red-50/50 rounded-xl space-y-2 border border-red-100">
                  <div className="text-sm font-bold text-primary italic">"{q.text}"</div>
                  <div className="text-xs text-red-700">
                    <span className="font-bold">Competitors mentioned:</span> {q.results[0].mentions.map(m => m.companyName).join(", ")}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-green-700 mt-2">
                    Action: Create localized service taxonomy content for this keyword.
                  </div>
               </div>
             ))}
             {(!queryDiscovery || queryDiscovery.queries.every(q => q.results.some(r => r.isTargetCompanyMentioned))) && (
               <div className="p-12 text-center text-muted-foreground italic text-sm">
                  Excellent coverage! No significant missed opportunities in this scan.
               </div>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
