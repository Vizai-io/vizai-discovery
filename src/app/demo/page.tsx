
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Truck, Factory, Scale, Zap, Loader2, Search, ArrowRight, ShieldCheck } from "lucide-react";
import { DemoSeeder, DEMO_PROFILES } from "@/lib/services/demo-seeder";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";

const INDUSTRIES = [
  { id: "logistics" as const, title: "Logistics", icon: Truck, desc: "3PL & Supply Chain", color: "bg-blue-500" },
  { id: "warehousing" as const, title: "Warehousing", icon: Building2, desc: "Industrial Storage", color: "bg-green-500" },
  { id: "manufacturing" as const, title: "Manufacturing", icon: Factory, desc: "OEM Components", color: "bg-orange-500" },
  { id: "legal" as const, title: "Legal Services", icon: Scale, desc: "Corporate Advisory", color: "bg-purple-500" },
];

export default function DemoSelectorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleLaunchDemo = async (industryId: keyof typeof DEMO_PROFILES) => {
    setLoading(industryId);
    try {
      const { scanId } = await DemoSeeder.seedDemoForIndustry(industryId);
      toast({ title: "Demo Initialized", description: `Profile created for ${DEMO_PROFILES[industryId].companyName}` });
      router.push(`/scans/${scanId}`);
    } catch (error) {
      toast({ title: "Demo Error", variant: "destructive" });
    } finally {
      setLoading(null);
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

      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-headline font-bold text-primary">Experience the Intelligence</h1>
          <p className="text-muted-foreground text-lg">Select an industry to see VizAI analyze visibility in real-time.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 w-full">
          {INDUSTRIES.map((industry) => (
            <Card key={industry.id} className="hover:shadow-xl transition-all border-none bg-white overflow-hidden flex flex-col">
              <CardHeader className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${industry.color} text-white`}><industry.icon className="w-6 h-6" /></div>
                <div><CardTitle className="text-xl font-bold">{industry.title}</CardTitle><CardDescription>{industry.desc}</CardDescription></div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-end pt-0">
                <Button 
                  className="w-full h-12 gap-2 bg-primary hover:bg-primary/90 text-white font-bold"
                  onClick={() => handleLaunchDemo(industry.id)}
                  disabled={!!loading}
                >
                  {loading === industry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Launch Demo Scan <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
