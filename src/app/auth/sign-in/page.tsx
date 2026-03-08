
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, ShieldCheck, Mail, Lock } from "lucide-react";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleMockLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate login delay
    setTimeout(() => {
      router.push("/dashboard");
    }, 800);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-gradient-to-b from-white to-slate-50">
      <div className="mb-8 text-center space-y-2">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <Search className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-black text-primary tracking-tighter">VizAI Intelligence</span>
        </Link>
      </div>

      <Card className="w-full max-w-md border-none shadow-2xl bg-white overflow-hidden">
        <CardHeader className="bg-primary/5 border-b py-6 px-8 text-center">
          <CardTitle className="text-xl font-bold text-primary">Intelligence Access</CardTitle>
          <CardDescription className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Professional Discovery Console</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleMockLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Professional Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="name@company.com" className="pl-10" required />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Security Key</Label>
                <button type="button" className="text-[10px] font-bold text-primary hover:underline">Forgot Key?</button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="password" type="password" className="pl-10" placeholder="••••••••" required />
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold gap-2 shadow-lg shadow-primary/20"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShieldCheck className="w-4 h-4" /> Enter Command Center</>}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t text-center space-y-4">
            <p className="text-xs text-muted-foreground">New to VizAI Intelligence?</p>
            <div className="flex gap-3 justify-center">
              <Link href="/free-scan">
                <Button variant="outline" size="sm" className="text-[10px] font-bold uppercase tracking-widest h-8 px-4">Run Free Scan</Button>
              </Link>
              <Link href="/demo">
                <Button variant="ghost" size="sm" className="text-[10px] font-bold uppercase tracking-widest h-8 px-4">Launch Demo</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <footer className="mt-8 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">
        &copy; {new Date().getFullYear()} VizAI Consulting Group
      </footer>
    </div>
  );
}
