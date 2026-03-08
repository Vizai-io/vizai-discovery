"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Zap, 
  Search, 
  Loader2, 
  Building2, 
  Globe, 
  Users, 
  Settings2,
  AlertCircle
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function NewScanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "Acme Logistics",
    website: "https://acme-logistics.ai",
    industry: "Third Party Logistics (3PL)",
    serviceCategories: "Freight Forwarding, Warehouse Management, Cold Chain",
    targetGeography: "North America, Western Europe",
    competitors: "FedEx, UPS, DHL",
  });

  const handleRunScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      toast({
        title: "Scan Complete",
        description: "Your AI visibility report is ready.",
      });

      // Navigate to results (with a mock id)
      router.push("/scans/results/latest");
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: "There was an error generating your report.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg">
          <Zap className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-primary">New Visibility Scan</h2>
          <p className="text-muted-foreground">Configure your AI discovery intelligence parameters.</p>
        </div>
      </div>

      <form onSubmit={handleRunScan} className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                Company Profile
              </CardTitle>
              <CardDescription>Official business details for LLM identification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input 
                    id="companyName" 
                    value={formData.companyName}
                    onChange={e => setFormData({...formData, companyName: e.target.value})}
                    placeholder="e.g. Acme Corp" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website URL</Label>
                  <Input 
                    id="website" 
                    value={formData.website}
                    onChange={e => setFormData({...formData, website: e.target.value})}
                    placeholder="https://..." 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Primary Industry</Label>
                <Input 
                  id="industry" 
                  value={formData.industry}
                  onChange={e => setFormData({...formData, industry: e.target.value})}
                  placeholder="e.g. Supply Chain & Logistics" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="services">Service Categories</Label>
                <Textarea 
                  id="services" 
                  value={formData.serviceCategories}
                  onChange={e => setFormData({...formData, serviceCategories: e.target.value})}
                  placeholder="Enter services separated by commas..." 
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                Context & Market
              </CardTitle>
              <CardDescription>Define where and how you want to be discovered.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="geography">Target Geography</Label>
                <Input 
                  id="geography" 
                  value={formData.targetGeography}
                  onChange={e => setFormData({...formData, targetGeography: e.target.value})}
                  placeholder="e.g. North America, Global" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="competitors">Main Competitors</Label>
                <Input 
                  id="competitors" 
                  value={formData.competitors}
                  onChange={e => setFormData({...formData, competitors: e.target.value})}
                  placeholder="Competitor names, separated by commas..." 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-none shadow-lg bg-primary text-white">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-accent" />
                Scan Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between text-xs font-medium text-white/60">
                  <span>Engine</span>
                  <span className="text-white">VizAI Multi-Vector v1.0</span>
                </div>
                <div className="flex justify-between text-xs font-medium text-white/60">
                  <span>Providers</span>
                  <span className="text-white">OpenAI, Google, Anthropic</span>
                </div>
                <div className="flex justify-between text-xs font-medium text-white/60">
                  <span>Estimated Time</span>
                  <span className="text-white">~3.5 Minutes</span>
                </div>
              </div>
              
              <Button 
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent/90 text-primary font-bold h-12"
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</>
                ) : (
                  <>Start Discovery Scan</>
                )}
              </Button>

              <div className="p-3 bg-white/10 rounded-lg text-[10px] leading-relaxed flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-accent" />
                <span>By starting this scan, you acknowledge that VizAI will query multiple LLM providers to benchmark your visibility.</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-primary">Recent Success</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                  <Search className="w-4 h-4" />
                </div>
                <div className="text-[10px]">
                  <div className="font-bold text-primary">Oct 24, 2023</div>
                  <div className="text-muted-foreground">Overall Visibility: 72.4</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
