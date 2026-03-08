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
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Category Breakdown */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Category Performance</CardTitle>
            <CardDescription>How scores weigh against benchmarks</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
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

        {/* Competitor Comparison */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Competitor Benchmarking</CardTitle>
            <CardDescription>Relative AI discoverability</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={MOCK_COMPETITORS}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
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
            <div className="mt-4 space-y-2">
               {MOCK_COMPETITORS.map((c, i) => (
                 <div key={i} className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: i === 0 ? '#174C80' : '#CBD5E1' }} />
                       {c.name}
                    </span>
                    <span className="font-bold text-primary">{c.score}</span>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>

        {/* Description Accuracy Analysis */}
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
                  <div className="text-xs">
                    <span className="font-bold text-primary block">Correct Service Range</span>
                    <span className="text-muted-foreground">AI correctly identified you as a 3PL provider for Western Europe.</span>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold text-primary block">Missing Revenue Models</span>
                    <span className="text-muted-foreground">LLMs failed to mention your new "Subscription Logistics" tier.</span>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold text-primary block">Historical Inaccuracy</span>
                    <span className="text-muted-foreground">AI models incorrectly claim you were founded in 2018 (Actual: 2012).</span>
                  </div>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Knowledge Gaps */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Knowledge Gaps</CardTitle>
            <CardDescription>Missing technical data signals for LLMs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { type: 'Structured Data', gap: 'Missing JSON-LD localBusiness schema', impact: 'Reduced regional discovery in local-intent queries.' },
              { type: 'Content', gap: 'No publicly available API documentation', impact: 'AI cannot explain your technical integration capabilities.' },
              { type: 'Citations', gap: 'Lack of verified reviews on neutral platforms', impact: 'LLMs hesitate to recommend you as an authoritative leader.' },
            ].map((g, i) => (
              <div key={i} className="flex gap-4 p-4 hover:bg-muted/30 transition-colors rounded-xl border border-transparent hover:border-border">
                 <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                 </div>
                 <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">{g.type}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{g.gap}</span>
                    </div>
                    <p className="text-sm font-medium text-primary/80">{g.impact}</p>
                 </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Missed Opportunities */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Missed Discovery Queries</CardTitle>
            <CardDescription>High-value intents where you didn't appear</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             {[
               { query: "Most reliable cold-chain logistics in Canada", reason: "Lack of regional service keywords", action: "Optimize geo-specific landing pages" },
               { query: "Top 10 3PL providers with AI integration", reason: "AI capability content gap", action: "Publish AI strategy whitepaper" },
               { query: "Logistics companies founded before 2015", reason: "Entity data mismatch (Foundation date)", action: "Update Crunchbase/LinkedIn profiles" },
             ].map((q, i) => (
               <div key={i} className="p-4 bg-muted/20 rounded-xl space-y-2">
                  <div className="text-sm font-bold text-primary italic">"{q.query}"</div>
                  <div className="flex gap-4 text-[10px] uppercase font-bold">
                    <span className="text-red-500">Reason: {q.reason}</span>
                    <span className="text-green-600">Action: {q.action}</span>
                  </div>
               </div>
             ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
