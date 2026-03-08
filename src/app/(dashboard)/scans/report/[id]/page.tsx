
"use client";

import { use, useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
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
  TrendingUp,
  Lock,
  FileSearch,
  EyeOff
} from "lucide-react";
import Link from "next/link";
import { QueryDiscoveryData, StrategicRecommendation, ScanRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { collection, doc, getDoc, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase-config";

export default function ClientReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scanRecord, setScanRecord] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
      setLoading(true);
      try {
        if (id === 'latest') {
          const scansRef = collection(db, "scans");
          const q = query(scansRef, where("status", "==", "completed"), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setScanRecord({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ScanRecord);
          }
        } else {
          const docRef = doc(db, "scans", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setScanRecord({ id: docSnap.id, ...docSnap.data() } as ScanRecord);
          }
        }
      } catch (e) {
        console.error("Error loading report:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [id]);

  const isCaseStudy = scanRecord?.reportType === 'case-study';
  const anonymizeSubject = scanRecord?.anonymizeSubject;
  const anonymizeRivals = scanRecord?.anonymizeCompetitors;

  const displayIdentity = useMemo(() => {
    if (!scanRecord) return "Client Account";
    if (isCaseStudy && anonymizeSubject) {
      return scanRecord.caseStudyTitle || "Industry Leader";
    }
    return scanRecord.results.companyName || "Client Account";
  }, [scanRecord, isCaseStudy, anonymizeSubject]);

  const getDisplayCompetitor = (name: string, index: number) => {
    if (anonymizeRivals) {
      return `Rival ${String.fromCharCode(65 + index)}`;
    }
    return name;
  };

  const results = useMemo(() => scanRecord?.results || {
    overallScore: 72.4,
    categoryScores: { presence: 78, descriptionAccuracy: 88, citationStrength: 65, serviceCoverage: 54, competitorShareOfVoice: 42 },
    priorityActions: [] as StrategicRecommendation[]
  }, [scanRecord]);

  const queryDiscovery = useMemo(() => scanRecord?.queryDiscovery || null, [scanRecord]);

  const handlePrint = () => {
    window.print();
  };

  const CATEGORY_SCORES = [
    { label: "AI Presence", score: results.categoryScores.presence, icon: Search },
    { label: "Description Accuracy", score: results.categoryScores.descriptionAccuracy, icon: ShieldCheck },
    { label: "Citation Strength", score: results.categoryScores.citationStrength, icon: Target },
    { label: "Service Coverage", score: results.categoryScores.serviceCoverage, icon: Zap },
    { label: "Market Share of Voice", score: results.categoryScores.competitorShareOfVoice, icon: Users },
  ];

  if (loading) {
    return <div className="p-20 text-center">Constructing final report...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 print:space-y-6 print:pb-0">
      {/* Report Controls - Hidden on Print */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/scans/results/${id}`}>
          <Button variant="ghost" className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-3">
           {(anonymizeSubject || anonymizeRivals) && (
             <Badge variant="outline" className="bg-accent/10 text-primary border-accent/20 uppercase font-bold text-[9px]">
               <EyeOff className="w-3 h-3 mr-1" /> Anonymization Active
             </Badge>
           )}
           {scanRecord?.reviewStatus && scanRecord.reviewStatus !== 'approved' && (
             <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200 uppercase font-bold text-[9px]">
               <FileSearch className="w-3 h-3 mr-1" /> Internal Draft
             </Badge>
           )}
           <Button onClick={handlePrint} className="gap-2 bg-primary text-white shadow-lg">
             <Printer className="w-4 h-4" /> Export / Print Audit
           </Button>
        </div>
      </div>

      {/* Report Header */}
      <header className="border-b-4 border-primary pb-8 space-y-6 print:pb-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                <FileText className="w-3 h-3 text-accent" />
                {isCaseStudy ? 'Intelligence Case Study • Public Release' : 'Client Intelligence Report • Private & Confidential'}
              </div>
              {scanRecord?.reviewStatus === 'approved' && (
                <Badge className="bg-green-50 text-green-700 border-green-200 text-[8px] uppercase font-bold tracking-[0.2em]">
                   <Lock className="w-3 h-3 mr-1" /> Verified & Approved
                </Badge>
              )}
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
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Target Organization</div>
            <div className="text-sm font-bold text-primary truncate">{displayIdentity}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Analysis Scale</div>
            <div className="text-sm font-bold text-primary">Multi-Vector</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Tier</div>
            <div className="text-sm font-bold text-primary capitalize">{scanRecord?.reportType || 'Internal'}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Audit Date</div>
            <div className="text-sm font-bold text-primary">{new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </header>

      {/* Executive Summary Section */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6 border-b pb-6 print:pb-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-primary">Executive Summary</h2>
            <div className="text-sm text-muted-foreground max-w-2xl leading-relaxed whitespace-pre-wrap">
              {results.overview || "This audit details the AI Visibility Index and discoverability footprint for your organization. Tactical adjustments to entity signals and capability positioning are required to regain parity."}
            </div>
          </div>
          <div className="sm:ml-auto text-center p-4 bg-primary text-white rounded-2xl shadow-xl min-w-[140px] print:shadow-none print:border print:border-primary print:text-primary print:bg-white">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Overall Score</div>
            <div className="text-5xl font-bold">{results.overallScore.toFixed(1)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {CATEGORY_SCORES.map((cat, i) => (
            <div key={i} className="p-4 bg-white rounded-xl border border-slate-100 flex flex-col items-center text-center space-y-2 print:border-slate-200 shadow-sm print:shadow-none">
              <div className="p-2 rounded-lg bg-primary/5 text-primary">
                <cat.icon className="w-5 h-5" />
              </div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">{cat.label}</div>
              <div className="text-2xl font-bold text-primary">{cat.score}%</div>
            </div>
          ))}
        </div>
      </section>

      {/* Recommendations Section */}
      <section className="space-y-4 pt-8 print:pt-4 page-break-before-auto">
        <h3 className="text-xl font-bold text-primary flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Strategic Strategic Actions
        </h3>
        <div className="space-y-4">
          {results.priorityActions.map((rec: StrategicRecommendation, i: number) => (
            <div key={i} className="p-6 bg-white border border-slate-100 rounded-2xl flex flex-col sm:flex-row items-start gap-6 print:border-slate-200 shadow-sm print:shadow-none">
              <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg shrink-0 print:border print:border-primary print:text-primary print:bg-white">
                {i + 1}
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                   <div className="text-[10px] font-bold text-accent uppercase tracking-widest">{rec.category}</div>
                   <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-[8px] uppercase h-4 px-1 leading-none">
                     {rec.priority} Priority
                   </Badge>
                </div>
                <div className="text-lg font-bold text-primary">{rec.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{rec.description}</p>
                <div className="pt-2">
                   <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 text-primary text-[10px] font-bold uppercase">
                     <TrendingUp className="w-3 h-3 text-accent" />
                     Primary Outcome: {rec.expectedImpact}
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Discovery Analysis Table Section */}
      <section className="space-y-4 pt-8 print:pt-4 page-break-before-auto">
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="text-xl font-bold text-primary flex items-center gap-2">
            <Globe className="w-5 h-5 text-accent" />
            Intelligence Signal Coverage
          </h3>
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">
            Audit of Multi-Vector Intents
          </Badge>
        </div>
        
        <div className="overflow-hidden rounded-xl border border-slate-200 print:rounded-none">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b print:bg-white">
              <tr>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Query Vector</th>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest text-center">Signal Presence</th>
                <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Dominant Mentions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queryDiscovery?.queries.slice(0, 10).map((q, i) => {
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
                          {isMentioned ? "Presence" : "Deficit"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[10px] text-muted-foreground font-medium">
                      {q.results[0].mentions.slice(0, 3).map((m, idx) => getDisplayCompetitor(m.companyName, idx)).join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
