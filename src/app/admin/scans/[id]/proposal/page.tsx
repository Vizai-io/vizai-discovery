
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { ScanRecord, ProposalData, ServicePackageType } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ChevronLeft, 
  Briefcase, 
  Save, 
  Printer, 
  Plus, 
  Trash2, 
  Sparkles, 
  Loader2,
  TrendingUp,
  Target,
  Search,
  Activity,
  Boxes,
  Zap
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PackageService } from "@/lib/services/package-service";

export default function ProposalBuilderPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Proposal State
  const [proposal, setProposal] = useState<ProposalData>({
    summary: "",
    gaps: [],
    workstreams: [],
    projections: "",
    monitoringPlan: "",
    estimatedInvestment: "",
    suggestedPackage: 'Snapshot'
  });

  useEffect(() => {
    async function fetchScan() {
      setLoading(true);
      try {
        const docRef = doc(db, "scans", params.id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as ScanRecord;
          setScan(data);
          
          if (data.proposal) {
            setProposal(data.proposal);
          } else {
            const suggested = PackageService.getSuggestedPackage(data.results.categoryScores);
            setProposal({
              summary: `Strategy proposal for ${data.results.companyName} to improve AI discovery visibility from current index of ${data.results.overallScore.toFixed(1)}.`,
              gaps: data.results.knowledgeGaps?.map(g => g.description) || [],
              workstreams: data.results.priorityActions?.map(a => ({ 
                title: a.title, 
                description: a.description,
                packageType: a.packageType || suggested
              })) || [],
              projections: `Targeting a ${ (data.results.overallScore + 15).toFixed(1) } visibility index within 90 days.`,
              monitoringPlan: "Weekly multi-vector discovery audits and competitive intrusion alerts.",
              estimatedInvestment: suggested === 'Growth' ? "$15,000 / quarter" : "$12,500 / quarter",
              suggestedPackage: suggested
            });
          }
        }
      } catch (e) {
        console.error("Error loading proposal:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, "scans", params.id);
      await updateDoc(docRef, {
        proposal: {
          ...proposal,
          updatedAt: serverTimestamp()
        }
      });
      toast({ title: "Proposal Saved", description: "Draft has been updated successfully." });
    } catch (e) {
      toast({ title: "Save Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addGap = () => setProposal(p => ({ ...p, gaps: [...p.gaps, ""] }));
  const updateGap = (i: number, val: string) => {
    const next = [...proposal.gaps];
    next[i] = val;
    setProposal(p => ({ ...p, gaps: next }));
  };
  const removeGap = (i: number) => setProposal(p => ({ ...p, gaps: p.gaps.filter((_, idx) => idx !== i) }));

  const addWorkstream = () => setProposal(p => ({ 
    ...p, 
    workstreams: [...p.workstreams, { title: "", description: "", packageType: proposal.suggestedPackage || 'Snapshot' }] 
  }));
  
  const updateWorkstream = (i: number, field: any, val: string) => {
    const next = [...proposal.workstreams];
    next[i] = { ...next[i], [field]: val };
    setProposal(p => ({ ...p, workstreams: next }));
  };
  const removeWorkstream = (i: number) => setProposal(p => ({ ...p, workstreams: p.workstreams.filter((_, idx) => idx !== i) }));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Constructing proposal draft...</p>
      </div>
    );
  }

  const activePackageInfo = proposal.suggestedPackage ? PackageService.getPackageInfo(proposal.suggestedPackage) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 selection:bg-accent/20">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50 print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => router.back()}><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold text-primary">Strategic Proposal Builder</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Client: {scan?.results.companyName}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 mr-4 bg-muted/50 px-3 py-1.5 rounded-lg border">
             <Boxes className="w-4 h-4 text-primary" />
             <Select 
               value={proposal.suggestedPackage} 
               onValueChange={(val) => setProposal({...proposal, suggestedPackage: val as ServicePackageType})}
             >
               <SelectTrigger className="border-none bg-transparent h-6 focus:ring-0 text-xs font-bold p-0 min-w-[100px]">
                 <SelectValue placeholder="Package tier" />
               </SelectTrigger>
               <SelectContent>
                 {Object.keys(PackageService.PACKAGES).map(p => (
                   <SelectItem key={p} value={p}>{p} Tier</SelectItem>
                 ))}
               </SelectContent>
             </Select>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4" /> Save Draft
          </Button>
          <Button className="gap-2 bg-primary text-white" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Export / Print
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8 space-y-12 animate-in fade-in duration-500 print:p-0 print:space-y-8">
        {/* Proposal Print Branded Header */}
        <div className="hidden print:flex justify-between items-start border-b-4 border-primary pb-8 mb-12">
          <div className="space-y-2">
            <div className="text-[10px] font-black text-accent uppercase tracking-[0.3em]">VizAI Consulting Group</div>
            <h1 className="text-4xl font-black text-primary tracking-tighter">Strategic Optimization Proposal</h1>
            <p className="text-muted-foreground font-medium">Prepared for: <span className="text-primary font-bold">{scan?.results.companyName}</span></p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-primary">VizAI Intelligence</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">v1.4 Enterprise</div>
          </div>
        </div>

        {/* Package Indicator - NEW */}
        {activePackageInfo && (
          <div className="bg-primary text-white p-8 rounded-[2rem] shadow-xl overflow-hidden relative print:border print:bg-white print:text-primary print:shadow-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
              <div className="space-y-2 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2">
                  <Badge className="bg-accent text-primary font-black uppercase tracking-[0.2em] border-none px-3 py-1">
                    {activePackageInfo.label}
                  </Badge>
                </div>
                <h2 className="text-2xl font-black tracking-tight leading-tight">Recommended Engagement Framework framework</h2>
                <p className="text-sm text-white/70 max-w-lg leading-relaxed">{activePackageInfo.description}</p>
              </div>
              <div className="grid grid-cols-1 gap-2 shrink-0">
                {activePackageInfo.focus.map(f => (
                  <div key={f} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-sm">
                    <Zap className="w-3 h-3 text-accent fill-current" /> {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Section: Executive Summary */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 border-b pb-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary print:hidden">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-primary tracking-tight">Executive Summary</h2>
          </div>
          <Card className="border-none shadow-sm print:shadow-none print:border">
            <CardContent className="pt-6">
              <Textarea 
                value={proposal.summary} 
                onChange={(e) => setProposal({ ...proposal, summary: e.target.value })}
                className="min-h-[120px] text-base leading-relaxed border-none focus-visible:ring-0 p-0 resize-none print:min-h-0"
                placeholder="Overarching strategy goals..."
              />
            </CardContent>
          </Card>
        </section>

        {/* Section: Discovery Gaps */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 border-b pb-2">
            <div className="p-2 rounded-lg bg-red-100 text-red-600 print:hidden">
              <Target className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-primary tracking-tight">Primary Visibility Gaps</h2>
          </div>
          <div className="space-y-3">
            {proposal.gaps.map((gap, i) => (
              <div key={i} className="flex gap-3 items-start group">
                <Card className="flex-1 border-none shadow-sm print:shadow-none print:border bg-white">
                  <CardContent className="p-4">
                    <Input 
                      value={gap} 
                      onChange={(e) => updateGap(i, e.target.value)}
                      className="border-none focus-visible:ring-0 p-0 h-auto font-medium"
                      placeholder="Gap description..."
                    />
                  </CardContent>
                </Card>
                <Button variant="ghost" size="icon" className="shrink-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity print:hidden" onClick={() => removeGap(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full border-dashed gap-2 print:hidden" onClick={addGap}>
              <Plus className="w-4 h-4" /> Add Discovery Gap
            </Button>
          </div>
        </section>

        {/* Section: Workstreams */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 border-b pb-2">
            <div className="p-2 rounded-lg bg-accent/10 text-primary print:hidden">
              <Activity className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-primary tracking-tight">Recommended Workstreams</h2>
          </div>
          <div className="grid gap-4">
            {proposal.workstreams.map((ws, i) => (
              <div key={i} className="flex gap-3 items-start group">
                <Card className="flex-1 border-none shadow-sm print:shadow-none print:border bg-white overflow-hidden border-l-4 border-l-primary">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex justify-between items-start">
                      <Input 
                        value={ws.title} 
                        onChange={(e) => updateWorkstream(i, 'title', e.target.value)}
                        className="text-lg font-black text-primary border-none focus-visible:ring-0 p-0 h-auto flex-1 mr-4"
                        placeholder="Workstream Title"
                      />
                      <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest h-5 print:border-primary/20">
                        Tier: {ws.packageType || 'Core'}
                      </Badge>
                    </div>
                    <Textarea 
                      value={ws.description} 
                      onChange={(e) => updateWorkstream(i, 'description', e.target.value)}
                      className="text-sm text-muted-foreground border-none focus-visible:ring-0 p-0 resize-none min-h-[60px]"
                      placeholder="Technical implementation details..."
                    />
                  </CardContent>
                </Card>
                <Button variant="ghost" size="icon" className="shrink-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity print:hidden" onClick={() => removeWorkstream(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full border-dashed gap-2 print:hidden" onClick={addWorkstream}>
              <Plus className="w-4 h-4" /> Add Implementation Workstream
            </Button>
          </div>
        </section>

        {/* Section: Projections & Monitoring */}
        <div className="grid md:grid-cols-2 gap-8">
          <section className="space-y-4">
            <div className="flex items-center gap-3 border-b pb-2">
              <div className="p-2 rounded-lg bg-green-100 text-green-600 print:hidden">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-black text-primary tracking-tight">Projected Outcome</h2>
            </div>
            <Card className="border-none shadow-sm print:shadow-none print:border bg-white">
              <CardContent className="pt-6">
                <Textarea 
                  value={proposal.projections} 
                  onChange={(e) => setProposal({ ...proposal, projections: e.target.value })}
                  className="min-h-[80px] text-sm leading-relaxed border-none focus-visible:ring-0 p-0 resize-none"
                  placeholder="Expected Visibility ROI..."
                />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 border-b pb-2">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600 print:hidden">
                <Search className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-black text-primary tracking-tight">Monitoring Plan</h2>
            </div>
            <Card className="border-none shadow-sm print:shadow-none print:border bg-white">
              <CardContent className="pt-6">
                <Textarea 
                  value={proposal.monitoringPlan} 
                  onChange={(e) => setProposal({ ...proposal, monitoringPlan: e.target.value })}
                  className="min-h-[80px] text-sm leading-relaxed border-none focus-visible:ring-0 p-0 resize-none"
                  placeholder="Ongoing tracking schedule..."
                />
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Section: Investment */}
        <section className="space-y-4 pt-8 border-t">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-primary text-white p-8 rounded-[2rem] shadow-xl print:shadow-none print:border print:text-primary print:bg-white">
            <div className="space-y-1 text-center md:text-left">
              <h2 className="text-2xl font-black tracking-tight">Strategic Investment</h2>
              <p className="text-sm opacity-70">Implementation and onboarding for Discovery Phase 1.</p>
            </div>
            <div className="text-center md:text-right">
              <Input 
                value={proposal.estimatedInvestment} 
                onChange={(e) => setProposal({ ...proposal, estimatedInvestment: e.target.value })}
                className="text-3xl font-black bg-transparent border-none focus-visible:ring-0 p-0 h-auto text-center md:text-right w-full"
                placeholder="e.g. $10,000 / month"
              />
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-50 mt-1">Professional Services Engagement</div>
            </div>
          </div>
        </section>

        {/* Print Footer */}
        <footer className="hidden print:block pt-12 text-center space-y-2 border-t mt-12">
          <div className="text-sm font-bold text-primary">VizAI Discovery Intelligence Optimization Proposal</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em]">Confidential Proprietary Advisory • www.vizai-scanner.ai</div>
        </footer>
      </main>
    </div>
  );
}
