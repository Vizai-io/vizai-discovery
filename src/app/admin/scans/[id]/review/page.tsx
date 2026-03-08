
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/config"; // Using standard config path
import { ScanRecord, StrategicRecommendation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  FileSearch, 
  ChevronLeft, 
  ShieldCheck, 
  Save, 
  CheckCircle2, 
  Lock, 
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  StickyNote,
  MessageSquare
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ScanReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [overview, setOverview] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ScanRecord['reviewStatus']>('draft');
  const [recommendations, setRecommendations] = useState<StrategicRecommendation[]>([]);

  useEffect(() => {
    async function fetchScan() {
      setLoading(true);
      try {
        const docRef = doc(db, "scans", params.id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as ScanRecord;
          setScan(data);
          setOverview(data.results.overview || "");
          setInternalNotes(data.internalNotes || "");
          setReviewStatus(data.reviewStatus || 'draft');
          setRecommendations(data.results.priorityActions || []);
        }
      } catch (e) {
        console.error("Error fetching scan for review:", e);
        toast({
          title: "Error",
          description: "Could not load scan data.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [params.id]);

  const handleSave = async (isApproval = false) => {
    setSaving(true);
    try {
      const docRef = doc(db, "scans", params.id);
      const updates: Partial<ScanRecord> = {
        internalNotes,
        reviewStatus: isApproval ? 'approved' : reviewStatus,
        lastReviewedBy: "System Admin", // Replace with real user if auth implemented
        lastReviewedAt: serverTimestamp(),
        results: {
          ...scan!.results,
          overview,
          priorityActions: recommendations
        }
      };

      await updateDoc(docRef, updates);
      
      toast({
        title: isApproval ? "Audit Approved" : "Draft Saved",
        description: isApproval ? "This scan is now locked for client sharing." : "Internal changes have been persisted.",
      });

      if (isApproval) router.push("/admin");
    } catch (e) {
      toast({
        title: "Save Failed",
        description: "Error updating Firestore record.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddRecommendation = () => {
    setRecommendations([...recommendations, {
      title: "New Action Item",
      description: "Brief description of the recommendation...",
      category: "Strategy",
      priority: "medium",
      expectedImpact: "Visibility gain"
    }]);
  };

  const handleUpdateRecommendation = (index: number, field: keyof StrategicRecommendation, value: string) => {
    const updated = [...recommendations];
    updated[index] = { ...updated[index], [field]: value };
    setRecommendations(updated);
  };

  const handleRemoveRecommendation = (index: number) => {
    setRecommendations(recommendations.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Loading audit context...</p>
      </div>
    );
  }

  if (!scan) return null;

  return (
    <div className="min-h-screen bg-background pb-20 animate-in fade-in duration-500">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => router.back()}><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex items-center gap-2">
            <FileSearch className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold text-primary">Intelligence Review: {scan.results.companyName}</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Human Review Workflow • Stage: {reviewStatus}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="w-4 h-4" /> Save Draft
          </Button>
          <Button className="gap-2 bg-primary text-white" onClick={() => handleSave(true)} disabled={saving}>
            <CheckCircle2 className="w-4 h-4" /> Approve & Lock
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-8 grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Executive Summary Editor */}
          <Card className="border-none shadow-sm overflow-hidden bg-white">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Executive Summary / Key Findings
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <Textarea 
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                placeholder="Strategic overview of the AI scan report findings..."
                className="min-h-[250px] text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          {/* Strategic Recommendations Editor */}
          <Card className="border-none shadow-sm overflow-hidden bg-white">
            <CardHeader className="border-b bg-muted/10 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-accent" />
                Strategic Priority Actions
              </CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold" onClick={handleAddRecommendation}>
                Add Action
              </Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {recommendations.map((rec, i) => (
                <div key={i} className="p-4 bg-muted/20 rounded-xl border space-y-3 relative group">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => handleRemoveRecommendation(i)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Title</Label>
                      <Input 
                        value={rec.title} 
                        onChange={(e) => handleUpdateRecommendation(i, 'title', e.target.value)}
                        className="h-8 text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Expected Impact</Label>
                      <Input 
                        value={rec.expectedImpact} 
                        onChange={(e) => handleUpdateRecommendation(i, 'expectedImpact', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Action Description</Label>
                    <Textarea 
                      value={rec.description} 
                      onChange={(e) => handleUpdateRecommendation(i, 'description', e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Internal Context */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-primary text-white overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <StickyNote className="w-3 h-3 text-accent" />
                Internal Admin Notes
              </CardTitle>
              <CardDescription className="text-white/50 text-[10px]">Private section for consulting team</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Enter internal review notes, client context, or team instructions..."
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs min-h-[150px]"
              />
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                Audit Lifecycle
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">Review Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['draft', 'in-review', 'approved', 'shared'].map((status) => (
                    <Button 
                      key={status} 
                      variant={reviewStatus === status ? 'default' : 'outline'}
                      size="sm"
                      className="text-[10px] capitalize h-8"
                      onClick={() => setReviewStatus(status as any)}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>
              
              <div className="pt-4 border-t space-y-3">
                 <div className="flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground font-bold">Audit Score:</span>
                    <span className="font-black text-primary">{scan.results.overallScore.toFixed(1)}</span>
                 </div>
                 <div className="flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground font-bold">Last Reviewed:</span>
                    <span className="font-medium">
                      {scan.lastReviewedAt ? scan.lastReviewedAt.toDate().toLocaleDateString() : 'N/A'}
                    </span>
                 </div>
              </div>

              {reviewStatus === 'approved' && (
                <div className="p-3 bg-green-50 rounded-xl border border-green-100 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-green-700 leading-relaxed italic">
                    This scan is marked as <strong>Approved</strong>. Changes are locked for client-facing presentation views.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
                <MessageSquare className="w-3 h-3 text-accent" />
                Raw AI Findings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
               <div className="text-[9px] text-muted-foreground leading-relaxed">
                 You are editing the client-facing report. Original AI findings are preserved in the system history but the "Results" object is being updated for this audit identifier.
               </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
