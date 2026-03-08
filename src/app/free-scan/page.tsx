
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Zap, 
  Loader2, 
  Globe, 
  ChevronRight,
  ShieldAlert,
  Target
} from "lucide-react";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { ScanEngine } from "@/lib/services/scan-engine";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";
import { validateFreeScanRequest } from "@/lib/actions/usage-actions";

export default function FreeScanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    website: "",
    industry: "logistics",
    targetGeography: "",
    email: "", 
  });
  const [hp, setHp] = useState(""); 

  const handleRunFreeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.website || !formData.industry || !formData.email) {
      toast({ title: "Validation Error", description: "All fields are required.", variant: "destructive" });
      return;
    }

    setLoading(true);
    let scanId = "";
    try {
      // 1. Rate Limit
      const validation = await validateFreeScanRequest(formData.email, hp);
      if (!validation.allowed) {
        toast({ title: "Scan Restricted", description: validation.reason, variant: "destructive" });
        setLoading(false);
        return;
      }

      // 2. Initialize
      const scanRef = await addDoc(collection(db, "scans"), {
        ...formData,
        date: serverTimestamp(),
        status: "running",
        isPartial: true,
        results: { companyName: formData.companyName, overallScore: 0 }
      });
      scanId = scanRef.id;

      // 3. Generate Mock Result
      const scanResults = await ScanEngine.runFreeScan(formData);

      // 4. Finalize
      await updateDoc(doc(db, "scans", scanId), {
        status: "completed",
        results: scanResults,
        queryDiscovery: scanResults.queryDiscovery,
      });

      toast({ title: "Scan Ready", description: "Your free audit is complete." });
      router.push(`/free-scan/results/${scanId}`);
    } catch (error: any) {
      console.error("Free scan error:", error);
      const message = error.message || "Failed to generate free audit.";
      if (scanId) {
        await updateDoc(doc(db, "scans", scanId), { status: "failed", errorMessage: message }).catch(console.warn);
      }
      toast({ title: "Scan Failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b bg-white">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg"><Search className="w-5 h-5 text-white" /></div>
          <span className="text-xl font-headline font-bold text-primary">VizAI</span>
        </Link>
        <Link href="/auth/sign-in"><Button variant="ghost">Sign In</Button></Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-headline font-bold text-primary tracking-tight">Free AI Visibility Audit</h1>
          <p className="text-muted-foreground text-lg">Discover how AI systems currently recommend your brand in 60 seconds.</p>
        </div>

        <Card className="w-full border-none shadow-2xl bg-white overflow-hidden">
          <CardHeader className="bg-primary/5 border-b py-6 px-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white"><Zap className="w-5 h-5" /></div>
              <div><CardTitle className="text-lg">Intelligence Input</CardTitle><CardDescription className="text-xs">Provide baseline parameters for your audit.</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handleRunFreeScan} className="space-y-6">
              <div className="hidden" aria-hidden="true"><input type="text" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" /></div>
              <div className="space-y-2">
                <Label htmlFor="email">Business Email</Label>
                <Input id="email" type="email" placeholder="name@company.com" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="companyName">Company Name</Label><Input id="companyName" placeholder="Acme Corp" required value={formData.companyName} onChange={(e) => setFormData({...formData, companyName: e.target.value})} /></div>
                <div className="space-y-2"><Label htmlFor="website">Website URL</Label><Input id="website" type="url" placeholder="https://acme.ai" required value={formData.website} onChange={(e) => setFormData({...formData, website: e.target.value})} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry Vertical</Label>
                <Select value={formData.industry} onValueChange={(val) => setFormData({...formData, industry: val})}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select Industry" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logistics">Logistics & Supply Chain</SelectItem>
                    <SelectItem value="warehousing">Industrial Warehousing</SelectItem>
                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="legal">Corporate Legal Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="geography">Primary Location / Target Market</Label><Input id="geography" placeholder="e.g. North America, Global" required value={formData.targetGeography} onChange={(e) => setFormData({...formData, targetGeography: e.target.value})} /></div>
              <Button type="submit" className="w-full h-14 text-lg bg-primary hover:bg-primary/90 text-white font-bold gap-2 shadow-xl" disabled={loading}>
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Auditing...</> : <>Run Discovery Scan <ChevronRight className="w-5 h-5" /></>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
