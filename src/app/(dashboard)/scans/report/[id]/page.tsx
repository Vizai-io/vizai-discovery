"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Printer, 
  ChevronLeft, 
  ShieldCheck, 
  Target, 
  Search, 
  Zap, 
  Users,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Globe,
  Briefcase
} from "lucide-react";
import Link from "next/link";
import { QueryDiscoveryData } from "@/lib/types";
import { QueryEngine } from "@/lib/services/query-engine";
import { cn } from "@/lib/utils";

export default function ClientReportPage({ params }: { params: { id: string } }) {
  const [queryDiscovery, setQueryDiscovery] = useState<QueryDiscoveryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  const handlePrint = () => {
    window.print();
  };

  const CATEGORY_SCORES = [
    { label: "AI Presence", score: 78, icon: Search },
    { label: "Description Accuracy", score: 88, icon: ShieldCheck },
    { label: "Citation Strength", score: 65, icon: Target },
    { label: "Service Coverage", score: 54, icon: Zap },
    { label: "Market Share of Voice", score: 42, icon: Users },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 print:space-y-6 print:pb-0">
      {/* Report Controls - Hidden on Print */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/scans/results/${params.id}`}>
          <Button variant="ghost" className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
        </Link>
        <Button onClick={handlePrint} className="gap-2 bg-primary text-white shadow-lg">
          <Printer className="w-4 h-4" /> Export / Print Report
        </Button>
      </div>

      {/* Report Header */}
      <header className="border-b-4 border-primary pb-8 space-y-6 print:pb-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              <FileText className="w-3 h-3 text-accent" />
              Client Intelligence Report • Private & Confidential
            </div>
            <h1 className="text-4xl font-headline font-bold text-primary leading-tight">AI Visibility Discovery Audit</h1>
            <p className="text-lg text-muted-foreground">Comprehensive analysis of search prominence and LLM recommendation patterns.</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">VizAI</div>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Consulting Group</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-muted/30 p-6 rounded-2xl border print:p-4 print:bg-white print:border-slate-200">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Target Company</div>
            <div className="text-sm font-bold text-primary">Acme Logistics</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Industry Vertical</div>
            <div className="text-sm font-bold text-primary">3PL Logistics</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Geography</div>
            <div className="text-sm font-bold text-primary">Western Europe</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Audit Date</div>
            <div className="text-sm font-bold text-primary">Oct 24, 2023</div>
          </div>
        </div>
      </header>

      {/* Executive Summary Section */}
      <section className="space-y-6">
        <div className="flex items-end gap-6 border-b pb-6 print:pb-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-primary">Executive Summary</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              This report details the AI Visibility Index for Acme Logistics. Our analysis across major LLM providers (OpenAI, Gemini, Anthropic, Perplexity) shows a stable core presence but significant gaps in high-intent regional queries where competitors are currently owning the discovery narrative.
            </p>
          </div>
          <div className="ml-auto text-center p-4 bg-primary text-white rounded-2xl shadow-xl min-w-[140px] print:shadow-none print:border print:border-primary print:text-primary print:bg-white">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Overall Score</div>
            <div className="text-5xl font-bold">72.4</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {CATEGORY_SCORES.map((cat, i) => (
            <div key={i} className="p-4 bg-white rounded-xl border border-slate-100 flex flex-col items-center text-center space-y-2 print:border-slate-200">
              <div className="p-2 rounded-lg bg-primary/5 text-primary">
                <cat.icon className="w-5 h-5" />
              </div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">{cat.label}</div>
              <div className="text-2xl font-bold text-primary">{cat.score}%</div>
            </div>
          ))}
        </div>
      </section>

      {/* Key Findings Section */}
      <section className="space-y-4 pt-4 page-break-before-auto">
        <h3 className="text-xl font-bold text-primary flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-accent" />
          Critical Diagnostic Findings
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: "Service Taxonomy Drift", desc: "LLMs frequently miscategorize cold chain capabilities as general shipping, leading to lost high-value leads." },
            { title: "Regional Invisible Zones", desc: "Presence in DACH and Benelux markets is statistically insignificant compared to local competitors." },
            { title: "Low Citation Authority", desc: "AI models rely on 3rd party blogs for your data rather than your official whitepapers or documentation." },
            { title: "Competitor Hijack Pattern", desc: "FedEx and DHL are consistently listed first for 'innovative logistics' queries where you should be prominent." }
          ].map((item, i) => (
            <div key={i} className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 flex gap-4 print:bg-white print:border-slate-200">
              <div className="w-1 h-full bg-accent rounded-full shrink-0" />
              <div className="space-y-1">
                <div className="font-bold text-primary text-sm">{item.title}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Discovery Analysis Section */}
      <section className="space-y-4 pt-8 print:pt-4">
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="text-xl font-bold text-primary flex items-center gap-2">
            <Globe className="w-5 h-5 text-accent" />
            Discovery Signal Coverage
          </h3>
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">
            Audit of 24 Strategic Intent Vectors
          </Badge>
        </div>
        
        <div className="overflow-hidden rounded-xl border border-slate-200 print:rounded-none">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b print:bg-white">
              <tr>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Query Vector</th>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest text-center">AI Coverage</th>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Top Mentions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queryDiscovery?.queries.slice(0, 6).map((q, i) => {
                const isMentioned = q.results.some(r => r.isTargetCompanyMentioned);
                return (
                  <tr key={i} className="print:bg-white">
                    <td className="px-6 py-4 font-medium text-primary italic text-xs">"{q.text}"</td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1">
                        {isMentioned ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                        )}
                        <span className={cn("text-[10px] font-bold uppercase", isMentioned ? "text-green-600" : "text-red-500")}>
                          {isMentioned ? "Presence" : "Absent"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[10px] text-muted-foreground font-medium">
                      {q.results[0].mentions.slice(0, 3).map(m => m.companyName).join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recommendations Section */}
      <section className="space-y-4 pt-8 print:pt-4 page-break-before-always">
        <h3 className="text-xl font-bold text-primary flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Strategic Recommendations
        </h3>
        <div className="space-y-3">
          {[
            { cat: "Entity Optimization", title: "Deploy JSON-LD Structured Data", desc: "Implement full schema markup across the site to clarify service taxonomies for AI crawlers." },
            { cat: "Content Strategy", title: "Develop 'AI Knowledge Layer' Pages", desc: "Create high-authority, low-fluff pages specifically designed for LLM data ingestion and summarization." },
            { cat: "Digital Presence", title: "Increase Authoritative Citations", desc: "Build mentions in industry-standard publications to increase 'Confidence Scores' in AI model weights." }
          ].map((rec, i) => (
            <div key={i} className="p-6 bg-white border border-slate-100 rounded-2xl flex items-start gap-6 print:border-slate-200">
              <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg shrink-0 print:border print:border-primary print:text-primary print:bg-white">
                {i + 1}
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-accent uppercase tracking-widest">{rec.cat}</div>
                <div className="text-lg font-bold text-primary">{rec.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{rec.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer Branding for Print */}
      <footer className="hidden print:block pt-12 text-center space-y-2 border-t mt-12">
        <div className="text-sm font-bold text-primary">VizAI Discovery Intelligence Audit</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em]">www.vizai-scanner.ai • Confidential Proprietary Analysis</div>
      </footer>
    </div>
  );
}
