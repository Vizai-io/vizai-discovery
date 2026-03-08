
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/config";
import { ScanRecord, StrategicRecommendation, ServicePackageType } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Share2,
  Copy,
  ExternalLink,
  Eye,
  Calendar,
  Briefcase,
  Boxes,
  Zap,
  Info
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { PackageService } from "@/lib/services/package-service";

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
  const [shareEnabled, setShareEnabled] = useState(false);

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
          setShareEnabled(data.shareEnabled || false);
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

  const suggestedPackage = useMemo(() => {
    if (!scan) return null;
    return PackageService.getSuggestedPackage(scan.results.categoryScores);
  }, [scan]);

  const handleSave = async (isApproval = false) => {
    setSaving(true);
    try {
      const docRef = doc(db, "scans", params.id);
      const updates: Partial<ScanRecord> = {
        internalNotes,
        reviewStatus: isApproval ? 'approved' : reviewStatus,
        lastReviewedBy: "System Admin",
        lastReviewedAt: serverTimestamp(),
        shareEnabled,
        results: {
          ...scan!.results,
          overview,
          priorityActions: recommendations
        }
      };

      if (shareEnabled && !scan?.shareCreatedAt) {
        updates.shareCreatedAt = serverTimestamp();
        updates.viewCount = 0;
      }

      await updateDoc(docRef, updates);
      
      toast({
        title: isApproval ? "Audit Approved" : "Draft Saved",
        description: isApproval ? "This scan is now locked for client sharing." : "Internal changes have been persisted.",
      });

      if (isApproval) router.push("/admin");
      else {
        setScan(prev => prev ? { ...prev, ...updates } : null);
      }
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
      expectedImpact: "Visibility gain",
      packageType: 'Snapshot'
    }]);
  };

  const handleUpdateRecommendation = (index: number, field: keyof StrategicRecommendation, value: any) => {
    const updated = [...recommendations];
    updated[index] = { ...updated[index], [field]: value };
    setRecommendations(updated);
  };

  const handleRemoveRecommendation = (index: number) => {
    setRecommendations(recommendations.filter((_, i) => i !== index));
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/share/${params.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Share URL copied to clipboard.",
    });
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

  const isApproved = reviewStatus === 'approved';

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
          <Link href={`/admin/scans/${params.id}/proposal`}>
            <Button variant="outline" className="gap-2 border-accent text-primary font-bold">
              <Briefcase className="w-4 h-4 text-accent" />
              Build Proposal
            </Button>
          </Link>
          <Button variant="outline" className="gap-2" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="w-4 h-4" /> Save Draft
          </Button>
          <Button className="gap-2 bg-primary text-white" onClick={() => handleSave(true)} disabled={saving || isApproved}>
            <CheckCircle2 className="w-4 h-4" /> {isApproved ? 'Approved & Locked' : 'Approve & Lock'}
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
                className="min-h-[200px] text-sm leading-relaxed"
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
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-6 space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Title</Label>
                      <Input 
                        value={rec.title} 
                        onChange={(e) => handleUpdateRecommendation(i, 'title', e.target.value)}
                        className="h-8 text-xs font-bold"
                      />
                    </div>
                    <div className="col-span-3 space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Impact</Label>
                      <Input 
                        value={rec.expectedImpact} 
                        onChange={(e) => handleUpdateRecommendation(i, 'expectedImpact', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-3 space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Package Mapping</Label>
                      <Select 
                        value={rec.packageType || 'Snapshot'} 
                        onValueChange={(val) => handleUpdateRecommendation(i, 'packageType', val)}
                      >
                        <SelectTrigger className="h-8 text-[10px] font-bold bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(PackageService.PACKAGES).map(p => (
                            <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

        {/* Sidebar: Internal Context & Intelligence */}
        <div className="lg:col-span-4 space-y-6">
          {/* Package Intelligence - NEW */}
          <Card className="border-none shadow-sm overflow-hidden bg-primary text-white">
            <CardHeader className="bg-white/10 pb-4">
              <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Boxes className="w-4 h-4 text-accent" />
                Package Intelligence
              </CardTitle>
              <CardDescription className="text-white/60 text-[10px]">Internal alignment suggestion</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-primary">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-accent">Recommended Tier</div>
                  <div className="text-lg font-black">{suggestedPackage}</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[9px] font-bold uppercase text-white/40 tracking-tighter">Tier Focus Areas</div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedPackage && PackageService.getPackageInfo(suggestedPackage).focus.map(f => (
                    <Badge key={f} variant="outline" className="text-[8px] bg-white/5 border-white/10 text-white font-medium">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed italic opacity-70 border-t border-white/10 pt-3">
                Mapping recommendations to the <strong>{suggestedPackage}</strong> tier will improve conversion during the strategy briefing.
              </p>
            </CardContent>
          </Card>

          {/* Share Management */}
          <Card className={cn(
            "border-none shadow-sm overflow-hidden bg-white",
            !isApproved && "opacity-60 grayscale pointer-events-none"
          )}>
            <CardHeader className="border-b bg-accent/5">
              <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-primary">
                <Share2 className="w-3 h-3 text-accent" />
                Share Management
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-bold uppercase">Public Share Link</Label>
                  <p className="text-[9px] text-muted-foreground">Enable view-only access</p>
                </div>
                <Switch 
                  checked={shareEnabled} 
                  onCheckedChange={setShareEnabled} 
                  disabled={!isApproved}
                />
              </div>

              {shareEnabled && (
                <div className="space-y-3 animate-in slide-in-from-top-2">
                  <div className="flex gap-2">
                    <Input 
                      readOnly 
                      value={`${window.location.origin}/share/${params.id}`} 
                      className="h-8 text-[10px] bg-muted/30 border-none"
                    />
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={copyShareLink}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-muted/30 rounded-xl space-y-1">
                      <div className="text-[8px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <Eye className="w-2.5 h-2.5" /> Views
                      </div>
                      <div className="text-sm font-black text-primary">{scan.viewCount || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-xl space-y-1">
                      <div className="text-[8px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" /> Last Viewed
                      </div>
                      <div className="text-[9px] font-bold text-primary truncate">
                        {scan.lastViewedAt ? scan.lastViewedAt.toDate().toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <StickyNote className="w-3 h-3" />
                Internal Admin Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Textarea 
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Private review context..."
                className="text-xs min-h-[120px]"
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
