
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Search, 
  Target, 
  BarChart3, 
  ShieldCheck, 
  LineChart, 
  ChevronRight, 
  Globe, 
  Zap, 
  Network, 
  Trophy, 
  ArrowRight,
  History
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="px-6 py-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <Search className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-headline font-bold text-primary tracking-tight">VizAI Intelligence</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/rankings" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Benchmarking</Link>
          <Link href="/free-scan" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Free Audit</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/auth/sign-in">
            <Button variant="ghost" className="hidden sm:inline-flex font-bold text-primary">Sign In</Button>
          </Link>
          <Link href="/free-scan">
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/5 font-bold px-6">Run Free Scan</Button>
          </Link>
          <Link href="/demo">
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold px-6 shadow-lg shadow-primary/20">Launch Full Demo</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative py-24 px-6 overflow-hidden bg-gradient-to-b from-white to-background">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <div className="relative z-10 space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-primary font-bold text-[10px] uppercase tracking-widest">
                <Network className="w-3.5 h-3.5 text-accent" />
                <span>The Leader in AI Discoverability Intelligence</span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-headline font-bold leading-[1.05] text-primary tracking-tight">
                Control How AI Systems <span className="text-accent italic">Recommend</span> Your Brand
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg leading-relaxed font-medium">
                Measure and optimize your presence in the AI knowledge layer. We help enterprises understand exactly how ChatGPT, Perplexity, and Gemini discover, describe, and prioritize their services.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link href="/free-scan">
                  <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 shadow-2xl shadow-primary/30 group">
                    Get Your Free AI Audit
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/demo">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-primary/20 text-primary hover:bg-primary/5 font-bold">
                    View Interactive Demo
                  </Button>
                </Link>
              </div>
            </div>
            
            <div className="relative">
              <Card className="relative overflow-hidden border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] bg-white/60 backdrop-blur-xl">
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-end justify-between border-b pb-4">
                    <div className="space-y-1">
                       <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Visibility Index</div>
                       <div className="text-5xl font-bold text-primary tracking-tighter">72.4<span className="text-xl font-medium text-muted-foreground">/100</span></div>
                    </div>
                    <div className="text-right">
                       <div className="text-[10px] font-black text-green-600 uppercase tracking-widest">+4.2% Growth</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                      <div className="text-[9px] font-black text-muted-foreground uppercase mb-1">Description Accuracy</div>
                      <div className="text-xl font-bold text-primary">88.1%</div>
                    </div>
                    <div className="p-4 rounded-xl bg-accent/5 border border-accent/10">
                      <div className="text-[9px] font-black text-muted-foreground uppercase mb-1">Citation Strength</div>
                      <div className="text-xl font-bold text-accent">65.5%</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-primary text-white py-16 px-6">
        <div className="max-w-7xl mx-auto border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs opacity-40 font-bold uppercase tracking-widest">
          <div>&copy; {new Date().getFullYear()} VizAI Consulting Group. All rights reserved.</div>
          <div className="flex gap-8"><span>London • New York • Berlin</span></div>
        </div>
      </footer>
    </div>
  );
}
