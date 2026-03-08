import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Cpu, 
  History, 
  Trophy, 
  ArrowRight 
} from 'lucide-react';
import Image from 'next/image';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Navigation */}
      <header className="px-6 py-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <Search className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-headline font-bold text-primary tracking-tight">VizAI Intelligence</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <Link href="#how-it-works" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Methodology</Link>
          <Link href="#measures" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Intelligence Vectors</Link>
          <Link href="/rankings" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Benchmarking</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/login">
            <Button variant="ghost" className="hidden sm:inline-flex font-bold text-primary">Sign In</Button>
          </Link>
          <Link href="/demo">
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold px-6 shadow-lg shadow-primary/20">Launch Demo</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
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
                Measure and optimize your presence in the LLM knowledge layer. We help enterprises understand how ChatGPT, Perplexity, and Gemini discover, describe, and prioritize their services.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link href="/demo">
                  <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 shadow-2xl shadow-primary/30 group">
                    Start Your Intelligence Audit
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-primary/20 text-primary hover:bg-primary/5 font-bold">
                  View Case Studies
                </Button>
              </div>
              <div className="flex items-center gap-6 pt-6 opacity-70">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Trusted by AI-Forward Enterprises</div>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 via-accent/10 to-transparent rounded-[2rem] blur-3xl opacity-40 animate-pulse" />
              <Card className="relative overflow-hidden border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] bg-white/60 backdrop-blur-xl ring-1 ring-black/[0.05]">
                <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-slate-300" />
                    <div className="w-3 h-3 rounded-full bg-slate-200" />
                    <div className="w-3 h-3 rounded-full bg-slate-100" />
                  </div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[0.3em] font-black">Multi-Vector Discovery Audit v1.2</div>
                </div>
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-end justify-between border-b pb-4">
                    <div className="space-y-1">
                       <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Visibility Index</div>
                       <div className="text-5xl font-bold text-primary tracking-tighter">72.4<span className="text-xl font-medium text-muted-foreground">/100</span></div>
                    </div>
                    <div className="text-right">
                       <div className="text-[10px] font-black text-green-600 uppercase tracking-widest">+4.2% Growth</div>
                       <div className="text-[9px] text-muted-foreground">Market Baseline: 64.2</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-[72%] shadow-[0_0_12px_rgba(23,76,128,0.3)]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 shadow-sm">
                      <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Description Accuracy</div>
                      <div className="text-xl font-bold text-primary">88.1%</div>
                    </div>
                    <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 shadow-sm">
                      <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Citation Strength</div>
                      <div className="text-xl font-bold text-accent">65.5%</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section id="how-it-works" className="py-24 px-6 bg-white">
          <div className="max-w-7xl mx-auto space-y-16">
            <div className="text-center max-w-3xl mx-auto space-y-4">
              <h2 className="text-3xl font-headline font-bold text-primary sm:text-5xl tracking-tight">A Professional Grade Methodology</h2>
              <p className="text-muted-foreground text-lg font-medium leading-relaxed">Our intelligence engine follows a rigorous four-stage process to map your position in the AI search ecosystem.</p>
            </div>
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { step: "01", title: "Define Entity Profile", desc: "We map your official service taxonomy, capabilities, and unique value propositions.", icon: Search },
                { step: "02", title: "Simulate Intent Vectors", desc: "Our engine executes 24+ simulated user discovery paths across major LLM providers.", icon: Target },
                { step: "03", title: "Analyze Signal Weights", desc: "We measure how AI interprets your authority, location relevance, and citation strength.", icon: LineChart },
                { step: "04", title: "Strategic Roadmap", desc: "Receive prioritized actions to bridge knowledge gaps and recapture market share.", icon: Trophy }
              ].map((item, i) => (
                <div key={i} className="space-y-6 relative group">
                  <div className="text-5xl font-black text-primary/5 absolute -top-4 -left-2 group-hover:text-primary/10 transition-colors">{item.step}</div>
                  <div className="w-12 h-12 rounded-xl bg-primary/5 text-primary flex items-center justify-center font-bold shadow-sm relative z-10">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div className="space-y-2 relative z-10">
                    <h3 className="text-xl font-bold text-primary">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What the Scanner Measures */}
        <section id="measures" className="py-24 px-6 bg-muted/30">
          <div className="max-w-7xl mx-auto space-y-16">
            <div className="text-center max-w-3xl mx-auto space-y-4">
              <h2 className="text-3xl font-headline font-bold text-primary sm:text-4xl">Intelligence Vectors We Track</h2>
              <p className="text-muted-foreground text-lg">AI discoverability is determined by 6 core intelligence pillars.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Target, title: "AI Visibility Prominence", desc: "Overall frequency and priority positioning in AI-generated discovery responses." },
                { icon: BarChart3, title: "Competitive Share of Voice", desc: "Quantifying how often LLMs recommend your rivals for high-intent generic queries." },
                { icon: ShieldCheck, title: "Narrative Accuracy", desc: "Benchmarking AI summaries against your official business history and current capabilities." },
                { icon: Globe, title: "Geographic Coverage", desc: "Analysis of how well local and regional intents trigger your brand as a primary result." },
                { icon: LineChart, title: "Sourcing & Citations", desc: "Evaluating the authority of the external domains AI uses as proof-points for your entity." },
                { icon: Zap, title: "Service Taxonomy Clarity", desc: "How effectively AI classifies your various products into correct market segments." }
              ].map((item, i) => (
                <div key={i} className="p-10 rounded-3xl border border-primary/5 bg-white hover:border-accent/20 hover:shadow-2xl hover:shadow-primary/5 transition-all group">
                  <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center mb-8 group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                    <item.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-primary mb-4">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed font-medium">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Ongoing Monitoring Section */}
        <section className="py-24 px-6 bg-primary text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-accent/10 blur-[120px] rounded-full translate-x-1/2" />
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-accent font-bold text-[10px] uppercase tracking-widest border border-white/10">
                <History className="w-3 h-3" />
                <span>Continuous Optimization</span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-headline font-bold leading-tight">AI Training Sets Change. <br/><span className="text-accent">So Does Your Visibility.</span></h2>
              <p className="text-lg opacity-80 leading-relaxed font-medium">
                Unlike traditional SEO, AI knowledge is dynamic. Periodic scans are insufficient. Our monitoring engine tracks shifts in model behavior weekly, alerting you when visibility drops or when a competitor captures a new discovery intent.
              </p>
              <div className="grid grid-cols-2 gap-8 pt-4">
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-accent">Real-time</div>
                  <div className="text-[11px] font-bold uppercase tracking-widest opacity-60">Drift Detection</div>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-accent">Automated</div>
                  <div className="text-[11px] font-bold uppercase tracking-widest opacity-60">Intelligence Updates</div>
                </div>
              </div>
            </div>
            <div className="relative">
              <Card className="bg-white/5 border-white/10 backdrop-blur-md p-8 rounded-[2rem] space-y-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold uppercase tracking-widest text-accent">Monitoring Health</div>
                  <Badge variant="outline" className="text-white border-white/20">Active: Weekly</Badge>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Core Sector Visibility", val: 82, trend: "+2.1%" },
                    { label: "Regional Intent Match", val: 45, trend: "-1.5%" },
                    { label: "Competitor Share Voice", val: 31, trend: "-4.0%" },
                  ].map((s, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="opacity-70">{s.label}</span>
                        <span className={s.trend.startsWith('+') ? "text-green-400" : "text-red-400"}>{s.trend}</span>
                      </div>
                      <div className="h-1 w-full bg-white/10 rounded-full">
                        <div className="h-full bg-accent" style={{ width: `${s.val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-4 flex justify-center">
                  <div className="text-[10px] font-medium opacity-40 uppercase tracking-[0.4em]">Proprietary Monitoring Engine</div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Benchmarking Section */}
        <section className="py-24 px-6 bg-white border-b">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
               <div className="grid grid-cols-2 gap-4">
                  {[1,2,3,4].map(i => (
                    <Card key={i} className="p-6 border-primary/5 shadow-sm group hover:border-accent/20 transition-all">
                       <Trophy className="w-5 h-5 text-accent mb-3" />
                       <div className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Rank #{i}</div>
                       <div className="text-lg font-bold text-primary">Market Leader {i}</div>
                       <div className="mt-4 flex items-center justify-between text-[10px] font-bold">
                          <span className="text-muted-foreground">Index Score</span>
                          <span className="text-primary">{95 - (i*4)}.2</span>
                       </div>
                    </Card>
                  ))}
               </div>
            </div>
            <div className="space-y-8 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-primary font-bold text-[10px] uppercase tracking-widest border border-accent/20">
                <Trophy className="w-3 h-3 text-accent" />
                <span>Global Benchmarking</span>
              </div>
              <h2 className="text-4xl font-headline font-bold text-primary tracking-tight">Know Where You Stand <br/>Against the <span className="text-accent italic">Entire Sector</span></h2>
              <p className="text-lg text-muted-foreground leading-relaxed font-medium">
                Visibility metrics are meaningless without context. Our Industry Rankings allow you to benchmark your AI discoverability scores against top-tier competitors globally, identifying exactly who is winning the 'intent war' in your vertical.
              </p>
              <Link href="/rankings" className="inline-flex items-center font-bold text-primary hover:text-accent transition-colors">
                View Live Industry Leaderboards
                <ChevronRight className="ml-1 w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-6 text-center space-y-12">
           <div className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-4xl font-headline font-bold text-primary sm:text-6xl tracking-tight">Ready for a Strategic <br/>Intelligence Audit?</h2>
              <p className="text-xl text-muted-foreground font-medium">Stop guessing how AI views your brand. Get the definitive visibility report today.</p>
           </div>
           <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/demo">
                <Button size="lg" className="h-16 px-12 text-xl bg-primary hover:bg-primary/90 shadow-2xl shadow-primary/30">
                  Launch Free Demo Scan
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-16 px-12 text-xl border-primary text-primary hover:bg-primary/5 font-bold">
                Contact Sales
              </Button>
           </div>
           <div className="pt-12">
              <div className="flex justify-center -space-x-3 mb-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="w-12 h-12 rounded-full border-4 border-white bg-slate-100 overflow-hidden shadow-sm">
                    <Image src={`https://picsum.photos/seed/${i+50}/100/100`} width={48} height={48} alt="User" />
                  </div>
                ))}
              </div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Join 500+ Leading Enterprises</p>
           </div>
        </section>
      </main>

      <footer className="bg-primary text-white py-16 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Search className="w-8 h-8 text-accent" />
              <span className="text-3xl font-bold font-headline tracking-tighter">VizAI Scanner</span>
            </div>
            <p className="text-sm opacity-60 leading-relaxed font-medium">
              The professional grade discoverability engine for the AI-first world. Measure, monitor, and optimize your presence in the knowledge layer.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-accent uppercase tracking-widest text-xs mb-6">Intelligence</h4>
            <ul className="space-y-4 text-sm opacity-60">
              <li><Link href="#how-it-works" className="hover:text-white transition-colors">Methodology</Link></li>
              <li><Link href="#measures" className="hover:text-white transition-colors">Audit Vectors</Link></li>
              <li><Link href="/rankings" className="hover:text-white transition-colors">Industry Rankings</Link></li>
              <li><Link href="/monitoring" className="hover:text-white transition-colors">Global Monitoring</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-accent uppercase tracking-widest text-xs mb-6">Company</h4>
            <ul className="space-y-4 text-sm opacity-60">
              <li><Link href="#" className="hover:text-white transition-colors">About VizAI</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Advisory Board</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-accent uppercase tracking-widest text-xs mb-6">Legal & Security</h4>
            <ul className="space-y-4 text-sm opacity-60">
              <li><Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Data Security</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">GDPR Compliance</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-white/10 mt-16 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs opacity-40 font-bold uppercase tracking-widest">
          <div>&copy; {new Date().getFullYear()} VizAI Consulting Group. All rights reserved.</div>
          <div className="flex gap-8">
            <span>v1.2.4-PRO</span>
            <span>London • New York • Berlin</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
