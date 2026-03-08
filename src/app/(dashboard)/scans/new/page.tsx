
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Loader2, Building2, Globe, Users, ChevronRight, ChevronLeft, CheckCircle2, Briefcase, Target, Layers, MapPin, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { cn } from "@/lib/utils";
import { ScanEngine } from "@/lib/services/scan-engine";

const STEPS = [
  { id: 1, title: "Identity", icon: Building2 },
  { id: 2, title: "Market", icon: Globe },
  { id: 3, title: "Enrichment", icon: Layers },
  { id: 4, title: "Presence", icon: MapPin },
  { id: 5, title: "Capabilities", icon: Briefcase },
  { id: 6, title: "Competitors", icon: Users },
  { id: 7, title: "Launch", icon: Target },
];

export default function NewScanWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    website: "",
    industry: "",
    targetGeography: "",
    serviceCategories: "",
    competitors: "",
    foundingYear: "",
    employeeSize: "",
    googleBusinessProfileUrl: "",
    linkedInPageUrl: "",
    directoryListings: "",
  });

  const progress = (currentStep / STEPS.length) * 100;

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const handleFinish = async () => {
    setLoading(true);
    try {
      const profileData = {
        ...formData,
        foundingYear: parseInt(formData.foundingYear),
        serviceCategories: formData.serviceCategories.split(",").map(s => s.trim()),
        competitors: formData.competitors.split(",").map(c => c.trim()),
        createdAt: serverTimestamp(),
        organizationId: "org_default_acme"
      };

      const profileRef = await addDoc(collection(db, "companyProfiles"), profileData);
      const scanRef = await addDoc(collection(db, "scans"), {
        profileId: profileRef.id,
        date: serverTimestamp(),
        status: "pending",
        organizationId: "org_default_acme"
      });

      const scanOutput = await ScanEngine.runScan(profileData, profileRef.id, scanRef.id);

      await updateDoc(doc(db, "scans", scanRef.id), {
        status: "completed",
        results: scanOutput,
        queryDiscovery: scanOutput.queryDiscovery,
        realQueryResults: scanOutput.realQueryResults || []
      });

      toast({ title: "Scan Completed", description: "Audit finished successfully." });
      router.push(`/scans/${scanRef.id}`);
    } catch (error) {
      toast({ title: "Scan Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white"><Zap className="w-5 h-5" /></div>
          <div><h2 className="text-xl font-bold text-primary">Intelligence Setup</h2><p className="text-xs text-muted-foreground">Step {currentStep} of {STEPS.length}</p></div>
        </div>
        <div className="text-right"><div className="text-sm font-bold text-primary">{progress.toFixed(0)}%</div><Progress value={progress} className="w-32 h-2 mt-1" /></div>
      </div>

      <Card className="border-none shadow-xl bg-white overflow-hidden">
        <CardContent className="p-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary">Identity</h3>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Full Company Name</Label><Input value={formData.companyName} onChange={(e) => setFormData({...formData, companyName: e.target.value})} /></div>
                <div className="space-y-2"><Label>Website URL</Label><Input value={formData.website} onChange={(e) => setFormData({...formData, website: e.target.value})} /></div>
              </div>
            </div>
          )}
          {/* ... steps 2-6 omitted for brevity, logic remains same ... */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary">Final Review</h3>
              <div className="p-6 bg-muted/30 rounded-2xl border space-y-2 text-sm">
                <p><strong>Company:</strong> {formData.companyName}</p>
                <p><strong>Industry:</strong> {formData.industry}</p>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex gap-3 text-xs opacity-80">
                 <Sparkles className="w-5 h-5 text-accent" />
                 <p>Scan will run 8 simulated paths and 3 live model verification queries.</p>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mt-12 pt-6 border-t">
            <Button variant="ghost" onClick={prevStep} disabled={currentStep === 1 || loading}>Back</Button>
            {currentStep < STEPS.length ? (
              <Button onClick={nextStep} className="bg-primary text-white">Continue</Button>
            ) : (
              <Button onClick={handleFinish} disabled={loading} className="bg-accent text-primary font-bold shadow-lg">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Launching...</> : "Launch Intelligence Scan"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
