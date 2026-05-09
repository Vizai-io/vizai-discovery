"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, ShieldCheck, Mail, Lock, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signIn(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      // Supabase error messages (err.message) replace Firebase error codes
      const msg = (err?.message ?? "").toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("email not confirmed")) {
        setError("Invalid email or password.");
      } else if (msg.includes("rate limit") || msg.includes("too many")) {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Sign in failed. Please try again.");
      }
      setLoading(false);
    }
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
          <form onSubmit={handleSignIn} className="space-y-6">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Professional Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  className="pl-10"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Security Key</Label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  className="pl-10"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
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
              <Link href="/auth/register">
                <Button variant="outline" size="sm" className="text-[10px] font-bold uppercase tracking-widest h-8 px-4">Create Account</Button>
              </Link>
              <Link href="/free-scan">
                <Button variant="ghost" size="sm" className="text-[10px] font-bold uppercase tracking-widest h-8 px-4">Run Free Scan</Button>
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
