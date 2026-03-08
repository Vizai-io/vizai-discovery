
"use client";

import { useState, useEffect, useMemo } from "react";
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
  Globe,
  TrendingUp,
  FileSearch,
  Lock,
  EyeOff
} from "lucide-react";
import Link from "next/link";
import { StrategicRecommendation, ScanRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { doc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase-config";

export default function ProfessionalReportPage({ params }: { params: { id: string } }) {
  const [scanRecord, setScanRecord] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
      setLoading(true);
      try {
        if (params.id === 'latest') {
          const scansRef = collection(db, "scans");
          const q = query(scansRef, where("status", "==", "completed"), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setScanRecord({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ScanRecord);
          }
        } else {
          const docRef = doc(db, "scans", params.id);
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
  }, [params.id]);

  const isCaseStudy = scanRecord?.reportType === 'case-study';
  const anonymizeSubject = scanRecord?.anonymizeSubject;
  const anonymizeRivals = scanRecord?.anonymizeCompetitors;

  const displayIdentity = useMemo(() => {
    if (!scanRecord) return "Client Account";
    if (isCaseStudy && anonymizeSubject) return scanRecord.caseStudyTitle || "Industry Leader";
    return scanRecord.results.companyName || "Client Account";
  }, [scanRecord, isCaseStudy, anonymizeSubject]);

  const getDisplayCompetitor = (name: string, index: number) => {
    if (anonymizeRivals) return `Rival ${String.fromCharCode(65 + index)}`;
    return name;
  };

  const results = useMemo(() => scanRecord?.results || {
    overallScore: 72.4,
    categoryScores: { presence: 78, descriptionAccuracy: 88, citationStrength: 65, serviceCoverage: 54, competitorShareOfVoice: 42 },
    priorityActions: [] as StrategicRecommendation[]
  }, [scanRecord]);

  const queryDiscovery = useMemo(() => scanRecord?.queryDiscovery || null, [scanRecord]);

  const CATEGORY_SCORES = [
    { label: "AI Presence", score: results.categoryScores.presence, icon: Search },
    { label: "Description Accuracy", score: results.categoryScores.descriptionAccuracy, icon: ShieldCheck },
    { label: "Citation Strength", score: results.categoryScores.citationStrength, icon: Target },
    { label: "Service Coverage", score: results.categoryScores.serviceCoverage, icon: Zap },
    { label: "Market Share of Voice", score: results.categoryScores.competitorShareOfVoice, icon: Users },
  ];

  if (loading) return <div className="p-20 text-center">Constructing final report...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 print:space-y-6 print:pb-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/scans/${params.id}`}>
          <Button variant="ghost" className="gap-2"><ChevronLeft className="w-4 h-4" /> Back to Analytics</Button>
        </Link>
        <div className="flex gap-3">
           {(anonymizeSubject || anonymizeRivals) && <Badge variant="outline" className="bg-accent/10 text-primary text-[9px] font-bold"><EyeOff className="w-3 h-3 mr-1" /> Anonymization Active</Badge>}
           <Button onClick={() => window.print()} className="gap-2 bg-primary text-white shadow-lg"><Printer className="w-4 h-4" /> Export / Print Audit</Button>
        </div>
      </div>

      <header className="border-b-4 border-primary pb-8 space-y-6 print:pb-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]"><FileText className="w-3 h-3 text-accent" /> {isCaseStudy ? 'Intelligence Case Study' : 'Client Intelligence Report'}</div>
            <h1 className="text-4xl font-headline font-bold text-primary leading-tight">AI Visibility Discovery Audit</h1>
          </div>
          <div className="text-right text-2xl font-bold text-primary">VizAI</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-muted/30 p-6 rounded-2xl border print:bg-white">
          <div className="space-y-1"><div className="text-[10px] font-bold text-muted-foreground uppercase">Target Organization</div><div className="text-sm font-bold text-primary truncate">{displayIdentity}</div></div>
          <div className="space-y-1"><div className="text-[10px] font-bold text-muted-foreground uppercase">Audit Date</div><div className="text-sm font-bold text-primary">{new Date().toLocaleDateString()}</div></div>
        </div>
      </header>

      <section className="space-y-6">
        <div className="flex items-end gap-6 border-b pb-6">
          <div className="space-y-2 flex-1"><h2 className="text-2xl font-bold text-primary">Executive Summary</h2><div className="text-sm text-muted-foreground leading-relaxed">{results.overview}</div></div>
          <div className="text-center p-4 bg-primary text-white rounded-2xl min-w-[140px]"><div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Overall Score</div><div className="text-5xl font-bold">{results.overallScore.toFixed(1)}</div></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {CATEGORY_SCORES.map((cat, i) => (
            <div key={i} className="p-4 bg-white rounded-xl border flex flex-col items-center text-center space-y-2">
              <div className="p-2 rounded-lg bg-primary/5 text-primary"><cat.icon className="w-5 h-5" /></div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase">{cat.label}</div>
              <div className="text-2xl font-bold text-primary">{cat.score}%</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 pt-8">
        <h3 className="text-xl font-bold text-primary flex items-center gap-2"><Zap className="w-5 h-5 text-accent" /> Strategic Action Plan</h3>
        <div className="space-y-4">
          {results.priorityActions.map((rec: StrategicRecommendation, i: number) => (
            <div key={i} className="p-6 bg-white border rounded-2xl flex gap-6">
              <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg">{i + 1}</div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3"><div className="text-[10px] font-bold text-accent uppercase">{rec.category}</div><Badge variant="secondary" className="text-[8px] uppercase">{rec.priority} Priority</Badge></div>
                <div className="text-lg font-bold text-primary">{rec.title}</div>
                <p className="text-sm text-muted-foreground">{rec.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
