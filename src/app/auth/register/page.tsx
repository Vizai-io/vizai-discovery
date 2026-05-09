"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, UserPlus, Mail, Lock, User, Building2, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, signUp } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    try {
      await signUp(email, password, displayName, companyName);
      router.push("/dashboard");
    } catch (err: any) {
      // Supabase throws AuthError with err.message (not Firebase-style err.code).
      // Pattern-match on the message string. Fallback catches anything unrecognised.
      const msg: string = (err?.message ?? "").toLowerCase();
      if (msg.includes("user already registered") || msg.includes("already been registered")) {
        setError("An account with this email already exists.");
      } else if (msg.includes("password should be at least") || msg.includes("weak password")) {
        setError("Password is too weak. Use at least 6 characters.");
      } else if (msg.includes("invalid email") || msg.includes("unable to validate email")) {
        setError("Please enter a valid email address.");
      } else if (msg.includes("email rate limit")) {
        setError("Too many sign-up attempts. Please wait a moment and try again.");
      } else {
        setError(err?.message ?? "Registration failed. Please try again.");
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
          <CardTitle className="text-xl font-bold text-primary">Create Your Account</CardTitle>
          <CardDescription className="text-xs uppercase font-bold tracking-widest text-muted-foreground">AI Visibility Intelligence Platform</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleRegister} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="displayName">Your Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="displayName"
                  type="text"
                  placeholder="John Smith"
                  className="pl-10"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Acme Corporation"
                  className="pl-10"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
            </div>

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
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  className="pl-10"
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
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
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4" /> Create Account</>}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t text-center space-y-4">
            <p className="text-xs text-muted-foreground">Already have an account?</p>
            <Link href="/auth/sign-in">
              <Button variant="outline" size="sm" className="text-[10px] font-bold uppercase tracking-widest h-8 px-4">Sign In</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <footer className="mt-8 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">
        &copy; {new Date().getFullYear()} VizAI Consulting Group
      </footer>
    </div>
  );
}
