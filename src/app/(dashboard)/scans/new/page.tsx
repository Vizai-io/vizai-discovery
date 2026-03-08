
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
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
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
  Target,
  Calendar,
  Layers,
  Linkedin,
  MapPin,
  Library,
  Sparkles
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { cn } from "@/lib/utils";
import { ScanEngine } from "@/lib/services/scan-engine";

const STEPS = [
  { id: 1, title: "Identity", icon: Building2 },
  { id: 2, title: "Market", icon: Globe },
  { id: 3, title: "Entity Details", icon: Layers },
  { id: 4, title: "Presence", icon: MapPin },
  { id: 5, title: "Capabilities", icon: Briefcase },
  { id: 6, title: "Competitors", icon: Users },
  { id: 7, title: "Review", icon: Target },
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

  const isStepValid = () => {
    switch (currentStep) {
      case 1: return formData.companyName && formData.website;
      case 2: return formData.industry && formData.targetGeography;
      case 3: return formData.foundingYear && formData.employeeSize;
      case 5: return formData.serviceCategories;
      case 6: return formData.competitors;
      default: return true;
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Save Profile first to get ID
      const profileData = {
        ...formData,
        foundingYear: parseInt(formData.foundingYear),
        serviceCategories: formData.serviceCategories.split(",").map(s => s.trim()),
        competitors: formData.competitors.split(",").map(c => c.trim()),
        directoryListings: formData.directoryListings ? formData.directoryListings.split(",").map(d => d.trim()) : [],
        createdAt: serverTimestamp(),
        organizationId: "org_default_acme"
      };

      const profileRef = await addDoc(collection(db, "companyProfiles"), profileData);
      
      // 2. Create scan record in pending state
      const scanRef = await addDoc(collection(db, "scans"), {
        profileId: profileRef.id,
        date: serverTimestamp(),
        status: "pending",
        organizationId: "org_default_acme"
      });

      // 3. Run the Scan Engine (Includes verification)
      const scanOutput = await ScanEngine.runScan(profileData, profileRef.id, scanRef.id);

      // 4. Update Scan with results
      await updateDoc(doc(db, "scans", scanRef.id), {
        status: "completed",
        results: scanOutput,
        queryDiscovery: scanOutput.queryDiscovery,
        realQueryResults: scanOutput.realQueryResults || []
      });

      toast({
        title: "Scan Completed",
        description: "Audit finished. Real-world AI model verification included.",
      });

      router.push(`/scans/results/${scanRef.id}`);
    } catch (error) {
      console.error("Scan error:", error);
      toast({
        title: "Scan Failed",
        description: "Error executing intelligence audit.",
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
                "text-[10px] font-bold uppercase tracking-tighter text-center max-w-[60px]",
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
                <h3 className="text-lg font-bold text-primary">Entity Enrichment</h3>
                <p className="text-sm text-muted-foreground">Provide details to help AI systems verify your authority.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="foundingYear">Founding Year</Label>
                  <Input 
                    id="foundingYear" 
                    type="number"
                    placeholder="e.g. 1998" 
                    value={formData.foundingYear}
                    onChange={(e) => setFormData({...formData, foundingYear: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeSize">Employee Size</Label>
                  <Select 
                    onValueChange={(val) => setFormData({...formData, employeeSize: val})}
                    value={formData.employeeSize}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10</SelectItem>
                      <SelectItem value="11-50">11-50</SelectItem>
                      <SelectItem value="51-200">51-200</SelectItem>
                      <SelectItem value="201-500">201-500</SelectItem>
                      <SelectItem value="501-1000">501-1000</SelectItem>
                      <SelectItem value="1001+">1001+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-primary">Professional & Local Presence</h3>
                <p className="text-sm text-muted-foreground">Connect external profiles to strengthen citation authority.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gbp" className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-accent" /> Google Business Profile URL
                  </Label>
                  <Input 
                    id="gbp" 
                    type="url"
                    placeholder="https://business.google.com/..." 
                    value={formData.googleBusinessProfileUrl}
                    onChange={(e) => setFormData({...formData, googleBusinessProfileUrl: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin" className="flex items-center gap-2">
                    <Linkedin className="w-4 h-4 text-accent" /> LinkedIn Company Page
                  </Label>
                  <Input 
                    id="linkedin" 
                    type="url"
                    placeholder="https://linkedin.com/company/..." 
                    value={formData.linkedInPageUrl}
                    onChange={(e) => setFormData({...formData, linkedInPageUrl: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="directories" className="flex items-center gap-2">
                    <Library className="w-4 h-4 text-accent" /> Industry Directory Listings
                  </Label>
                  <Textarea 
                    id="directories" 
                    placeholder="e.g. Clutch, G2, Thomasnet (Comma separated)" 
                    value={formData.directoryListings}
                    onChange={(e) => setFormData({...formData, directoryListings: e.target.value})}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 5 && (
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
              </div>
            </div>
          )}

          {currentStep === 6 && (
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

          {currentStep === 7 && (
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
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Presence Signals</span>
                  <div className="text-sm font-bold text-primary">
                    {formData.googleBusinessProfileUrl ? 'GBP ' : ''}
                    {formData.linkedInPageUrl ? 'LI ' : ''}
                    {formData.directoryListings ? 'Dir' : ''}
                    {!formData.googleBusinessProfileUrl && !formData.linkedInPageUrl && !formData.directoryListings && 'None'}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Industry</span>
                  <div className="text-sm font-bold text-primary">{formData.industry}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Engine</span>
                  <div className="text-sm font-bold text-accent italic">VizAI Hybrid Multi-Vector v1.4</div>
                </div>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex items-start gap-3">
                 <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                 <p className="text-[11px] leading-relaxed opacity-80">
                   <strong>Hybrid Verification Mode</strong>: This scan will run 8 simulated vector paths and 3 live model verification queries to Gemini 1.5 Flash for high-fidelity auditing.
                 </p>
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
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verifying Models...</>
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
