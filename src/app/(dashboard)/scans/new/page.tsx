
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
import { 
  Zap, 
  Loader2, 
  Building2, 
  Globe, 
  Users, 
  ChevronRight, 
  ChevronLeft, 
  Target, 
  Layers, 
  MapPin, 
  Sparkles,
  AlertCircle
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
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

// Fallback icons if not provided
const Briefcase = (props: any) => <Building2 {...props} />;

export default function NewScanWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    companyName: "",
    website: "",
    industry: "logistics",
    targetGeography: "",
    serviceCategories: "",
    competitors: "",
    foundingYear: "2010",
    employeeSize: "51-200",
    googleBusinessProfileUrl: "",
    linkedInPageUrl: "",
    directoryListings: "",
  });

  const progress = (currentStep / STEPS.length) * 100;

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const handleFinish = async () => {
    setLoading(true);
    setError(null);
    let scanId = "";
    try {
      const profileData = {
        ...formData,
        foundingYear: parseInt(formData.foundingYear) || 2010,
        serviceCategories: formData.serviceCategories.split(",").map(s => s.trim()).filter(Boolean),
        competitors: formData.competitors.split(",").map(c => c.trim()).filter(Boolean),
        createdAt: serverTimestamp(),
        organizationId: "org_default_acme"
      };

      // 1. Create Records
      const profileRef = await addDoc(collection(db, "companyProfiles"), profileData);
      const scanRef = await addDoc(collection(db, "scans"), {
        profileId: profileRef.id,
        date: serverTimestamp(),
        status: "pending",
        organizationId: "org_default_acme",
        reviewStatus: "draft",
        results: { companyName: formData.companyName, industry: formData.industry }
      });
      scanId = scanRef.id;

      // 2. Start Execution
      const scanOutput = await ScanEngine.runScan(profileData, profileRef.id, scanId);

      // 3. Complete
      await updateDoc(doc(db, "scans", scanId), {
        status: "completed",
        results: scanOutput,
        queryDiscovery: scanOutput.queryDiscovery,
        realQueryResults: scanOutput.realQueryResults || []
      });

      toast({ title: "Scan Completed", description: "Audit finished successfully." });
      router.push(`/scans/${scanId}`);
    } catch (err: any) {
      console.error("Scan Launch Error:", err);
      const message = err.message || "An unexpected error occurred during the scan.";
      setError(message);
      if (scanId) {
        await updateDoc(doc(db, "scans", scanId), { 
          status: "failed", 
          errorMessage: message 
        }).catch(console.warn);
      }
      toast({ 
        title: "Scan Failed", 
        description: message,
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white"><Zap className="w-5 h-5" /></div>
          <div><h2 className="text-xl font-bold text-primary">Intelligence Setup</h2><p className="text-xs text-muted-foreground">Step {currentStep} of {STEPS.length}</p></div>
        </div>
        <div className="text-right"><div className="text-sm font-bold text-primary">{progress.toFixed(0)}%</div><Progress value={progress} className="w-32 h-2 mt-1" /></div>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/5 overflow-hidden">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-destructive">Execution Failure</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="link" size="sm" className="p-0 h-auto text-destructive font-bold h-6" onClick={() => setError(null)}>Dismiss & Try Again</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-xl bg-white overflow-hidden">
        <CardContent className="p-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2"><Building2 className="w-5 h-5" /> Brand Identity</h3>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Full Company Name</Label><Input value={formData.companyName} onChange={(e) => setFormData({...formData, companyName: e.target.value})} placeholder="e.g. Acme Logistics" /></div>
                <div className="space-y-2"><Label>Website URL</Label><Input value={formData.website} onChange={(e) => setFormData({...formData, website: e.target.value})} placeholder="https://acme.ai" /></div>
              </div>
            </div>
          )}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2"><Globe className="w-5 h-5" /> Market Alignment</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Industry Vertical</Label>
                  <Select value={formData.industry} onValueChange={(val) => setFormData({...formData, industry: val})}>
                    <SelectTrigger className="bg-muted/30 border-none"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="logistics">Logistics & Supply Chain</SelectItem>
                      <SelectItem value="warehousing">Industrial Warehousing</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="legal">Legal Services</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Primary Geography</Label><Input value={formData.targetGeography} onChange={(e) => setFormData({...formData, targetGeography: e.target.value})} placeholder="e.g. North America, Global" /></div>
              </div>
            </div>
          )}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2"><Layers className="w-5 h-5" /> Entity Enrichment</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Founding Year</Label><Input type="number" value={formData.foundingYear} onChange={(e) => setFormData({...formData, foundingYear: e.target.value})} /></div>
                  <div className="space-y-2">
                    <Label>Employee Size</Label>
                    <Select value={formData.employeeSize} onValueChange={(val) => setFormData({...formData, employeeSize: val})}>
                      <SelectTrigger className="bg-muted/30 border-none"><SelectValue /></SelectTrigger>
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
            </div>
          )}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2"><MapPin className="w-5 h-5" /> Digital Presence</h3>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Google Business Profile URL</Label><Input value={formData.googleBusinessProfileUrl} onChange={(e) => setFormData({...formData, googleBusinessProfileUrl: e.target.value})} /></div>
                <div className="space-y-2"><Label>LinkedIn Page URL</Label><Input value={formData.linkedInPageUrl} onChange={(e) => setFormData({...formData, linkedInPageUrl: e.target.value})} /></div>
              </div>
            </div>
          )}
          {currentStep === 5 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2"><Layers className="w-5 h-5" /> Primary Capabilities</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Service Categories (Comma separated)</Label>
                  <Textarea value={formData.serviceCategories} onChange={(e) => setFormData({...formData, serviceCategories: e.target.value})} placeholder="e.g. Cold Chain, Freight Forwarding, Custom Clearance" />
                </div>
              </div>
            </div>
          )}
          {currentStep === 6 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2"><Users className="w-5 h-5" /> Market Rivals</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Top Competitors (Comma separated)</Label>
                  <Textarea value={formData.competitors} onChange={(e) => setFormData({...formData, competitors: e.target.value})} placeholder="e.g. FedEx, DHL, Maersk" />
                </div>
              </div>
            </div>
          )}
          {currentStep === 7 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-primary">Final Review</h3>
              <div className="p-6 bg-muted/30 rounded-2xl border space-y-2 text-sm">
                <p><strong>Company:</strong> {formData.companyName}</p>
                <p><strong>Industry:</strong> {formData.industry}</p>
                <p><strong>Market:</strong> {formData.targetGeography}</p>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex gap-3 text-xs opacity-80">
                 <Sparkles className="w-5 h-5 text-accent" />
                 <p>Initiating multi-vector audit. Scan will run 8 simulated discovery paths and 3 live model verification queries across global AI knowledge sets.</p>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mt-12 pt-6 border-t">
            <Button variant="ghost" onClick={prevStep} disabled={currentStep === 1 || loading}>Back</Button>
            {currentStep < STEPS.length ? (
              <Button onClick={nextStep} className="bg-primary text-white" disabled={!formData.companyName || !formData.website}>Continue</Button>
            ) : (
              <Button onClick={handleFinish} disabled={loading} className="bg-accent text-primary font-bold shadow-lg min-w-[200px]">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Auditing Vectors...</> : "Launch Intelligence Scan"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
