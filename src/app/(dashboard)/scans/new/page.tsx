
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { 
  Zap, 
  Loader2, 
  Building2, 
  Globe, 
  Users, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2,
  Briefcase,
  Target
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { cn } from "@/lib/utils";
import { ScanEngine } from "@/lib/services/scan-engine";

const STEPS = [
  { id: 1, title: "Company", icon: Building2 },
  { id: 2, title: "Market", icon: Globe },
  { id: 3, title: "Capabilities", icon: Briefcase },
  { id: 4, title: "Competitors", icon: Users },
  { id: 5, title: "Review", icon: Target },
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
  });

  const progress = (currentStep / STEPS.length) * 100;

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const isStepValid = () => {
    switch (currentStep) {
      case 1: return formData.companyName && formData.website;
      case 2: return formData.industry && formData.targetGeography;
      case 3: return formData.serviceCategories;
      case 4: return formData.competitors;
      default: return true;
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Save Company Profile to Firestore
      const profileData = {
        ...formData,
        serviceCategories: formData.serviceCategories.split(",").map(s => s.trim()),
        competitors: formData.competitors.split(",").map(c => c.trim()),
        createdAt: serverTimestamp(),
        organizationId: "org_default_acme" // Mock org for v0.1
      };

      const profileRef = await addDoc(collection(db, "companyProfiles"), profileData);

      // 2. Run the Scan Engine (Includes Website Intelligence Extraction)
      const scanOutput = await ScanEngine.runScan({
        companyName: profileData.companyName,
        website: profileData.website,
        industry: profileData.industry,
        serviceCategories: profileData.serviceCategories,
        targetGeography: profileData.targetGeography,
        competitors: profileData.competitors,
      }, profileRef.id);

      // 3. Save Scan to Firestore
      const scanRef = await addDoc(collection(db, "scans"), {
        profileId: profileRef.id,
        date: serverTimestamp(),
        status: "completed",
        results: scanOutput,
        queryDiscovery: scanOutput.queryDiscovery,
        organizationId: "org_default_acme"
      });

      toast({
        title: "Scan Completed",
        description: "Your AI visibility report has been generated with website intelligence.",
      });

      // 4. Navigate to results
      router.push(`/scans/results/${scanRef.id}`);
    } catch (error) {
      console.error("Scan error:", error);
      toast({
        title: "Scan Failed",
        description: "There was an error analyzing the company footprint.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      {/* Wizard Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Intelligence Setup</h2>
              <p className="text-xs text-muted-foreground">Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1].title}</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-primary">{progress.toFixed(0)}% Complete</div>
            <Progress value={progress} className="w-32 h-2 mt-1" />
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex justify-between items-center px-2">
          {STEPS.map((step) => (
            <div key={step.id} className="flex flex-col items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                currentStep >= step.id ? "bg-primary text-white shadow-md" : "bg-muted text-muted-foreground"
              )}>
                {currentStep > step.id ? <CheckCircle2 className="w-5 h-5" /> : <step.icon className="w-4 h-4" />}
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-tighter",
                currentStep >= step.id ? "text-primary" : "text-muted-foreground"
              )}>
                {step.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Card className="border-none shadow-xl bg-white overflow-hidden">
        <CardContent className="p-8">
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-primary">Identity & Presence</h3>
                <p className="text-sm text-muted-foreground">Start by defining your official digital identity.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Full Company Name</Label>
                  <Input 
                    id="companyName" 
                    placeholder="e.g. Acme Global Logistics" 
                    value={formData.companyName}
                    onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Official Website URL</Label>
                  <Input 
                    id="website" 
                    type="url" 
                    placeholder="https://acme-logistics.ai" 
                    value={formData.website}
                    onChange={(e) => setFormData({...formData, website: e.target.value})}
                  />
                  <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                    <Zap className="w-3 h-3 text-accent" /> Our engine will extract intelligence signals directly from this URL.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-primary">Market Context</h3>
                <p className="text-sm text-muted-foreground">Define your operational domain and target regions.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry Vertical</Label>
                  <Input 
                    id="industry" 
                    placeholder="e.g. Pharmaceutical Logistics" 
                    value={formData.industry}
                    onChange={(e) => setFormData({...formData, industry: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="geography">Target Geographies</Label>
                  <Input 
                    id="geography" 
                    placeholder="e.g. North America, DACH Region" 
                    value={formData.targetGeography}
                    onChange={(e) => setFormData({...formData, targetGeography: e.target.value})}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-primary">Capabilities & Taxonomy</h3>
                <p className="text-sm text-muted-foreground">How should AI categorize your specific services?</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="services">Service Categories (Comma separated)</Label>
                <Textarea 
                  id="services" 
                  rows={6}
                  placeholder="e.g. Cold Chain Storage, Last-mile Delivery, Custom Clearance..." 
                  value={formData.serviceCategories}
                  onChange={(e) => setFormData({...formData, serviceCategories: e.target.value})}
                />
                <p className="text-[10px] text-muted-foreground italic">Tip: Be specific. Use the exact terms you want LLMs to associate with your brand.</p>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-primary">Competitive Benchmarking</h3>
                <p className="text-sm text-muted-foreground">Who else is AI recommending for your services?</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="competitors">Competitor Names (Comma separated)</Label>
                <Textarea 
                  id="competitors" 
                  rows={4}
                  placeholder="e.g. FedEx, DHL, UPS..." 
                  value={formData.competitors}
                  onChange={(e) => setFormData({...formData, competitors: e.target.value})}
                />
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-primary">Final Review</h3>
                <p className="text-sm text-muted-foreground">Confirm your intelligence parameters before launching the scan.</p>
              </div>
              <div className="grid grid-cols-2 gap-6 bg-muted/30 p-6 rounded-2xl border">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Company</span>
                  <div className="text-sm font-bold text-primary">{formData.companyName}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Industry</span>
                  <div className="text-sm font-bold text-primary">{formData.industry}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Geography</span>
                  <div className="text-sm font-bold text-primary">{formData.targetGeography}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Engine</span>
                  <div className="text-sm font-bold text-accent italic">VizAI Multi-Vector v1.2</div>
                </div>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex gap-3 items-start">
                <Target className="w-5 h-5 text-primary shrink-0" />
                <p className="text-xs text-primary leading-relaxed">By launching this scan, our engine will perform 24 simulated user intents and <strong>extract real-time signals from your website</strong> to benchmark your visibility.</p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-12 pt-6 border-t">
            <Button 
              variant="ghost" 
              onClick={prevStep} 
              disabled={currentStep === 1 || loading}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            
            {currentStep < STEPS.length ? (
              <Button 
                onClick={nextStep} 
                disabled={!isStepValid()}
                className="bg-primary hover:bg-primary/90 text-white gap-2 px-8"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button 
                onClick={handleFinish} 
                disabled={loading}
                className="bg-accent hover:bg-accent/90 text-primary font-bold gap-2 px-8 shadow-lg shadow-accent/20"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Footprint...</>
                ) : (
                  <>Launch Intelligence Scan <Zap className="w-4 h-4 fill-current" /></>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
