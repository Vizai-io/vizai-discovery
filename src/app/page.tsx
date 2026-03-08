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
  Zap
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
          <span className="text-xl font-headline font-bold text-primary">VizAI Scanner</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Features</Link>
          <Link href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">How it Works</Link>
          <Link href="/rankings" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Industry Rankings</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/login">
            <Button variant="ghost" className="hidden sm:inline-flex">Sign In</Button>
          </Link>
          <Link href="/demo">
            <Button className="bg-primary hover:bg-primary/90 text-white">Run Demo Scan</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-24 px-6 overflow-hidden">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative z-10 space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-primary font-medium text-xs">
                <Zap className="w-3 h-3 text-accent" />
                <span>Next-Gen Discoverability Platform</span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-headline font-bold leading-[1.1] text-primary">
                Is Your Business Visible in the <span className="text-accent">AI Era?</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg">
                Measure and optimize how ChatGPT, Perplexity, Gemini, and Claude recommend your services. Don't be invisible to the world's smartest answers.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link href="/demo">
                  <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90">
                    Run Free Demo Scan
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-primary text-primary hover:bg-primary/5">
                  Book a Consultation
                </Button>
              </div>
              <div className="flex items-center gap-6 pt-6">
                <div className="flex -space-x-2">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-muted flex items-center justify-center overflow-hidden">
                      <Image src={`https://picsum.photos/seed/${i+10}/100/100`} width={40} height={40} alt="Avatar" />
                    </div>
                  ))}
                </div>
                <div className="text-sm">
                  <span className="font-bold text-primary">500+</span> Enterprise users tracking AI visibility
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-primary/10 via-accent/5 to-transparent rounded-[2rem] blur-2xl opacity-50" />
              <Card className="relative overflow-hidden border-none shadow-2xl bg-white/40 backdrop-blur-sm">
                <div className="p-4 border-b bg-white flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Live AI Visibility Scan</div>
                </div>
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-end gap-2">
                    <div className="text-4xl font-bold text-primary">72.4</div>
                    <div className="text-sm font-medium text-green-600 mb-1">+4.2%</div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-[72%] transition-all duration-1000" />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold">
                      <span>Visibility Score</span>
                      <span>Target: 85.0</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-white rounded-xl border border-primary/5 shadow-sm">
                      <div className="text-[10px] text-muted-foreground mb-1">Citation Strength</div>
                      <div className="text-lg font-bold text-primary">84%</div>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-primary/5 shadow-sm">
                      <div className="text-[10px] text-muted-foreground mb-1">Competitor Share</div>
                      <div className="text-lg font-bold text-primary">31%</div>
                    </div>
                  </div>
                  <div className="pt-2">
                    <div className="text-[10px] font-bold text-primary mb-2 uppercase tracking-wider">Missed Opportunities</div>
                    <div className="space-y-2">
                      <div className="p-2 text-xs bg-red-50 text-red-700 rounded-lg border border-red-100">"Top supply chain consultants in New York"</div>
                      <div className="p-2 text-xs bg-red-50 text-red-700 rounded-lg border border-red-100">"Which company offers the best AI logistics?"</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Value Pillars */}
        <section id="features" className="py-24 px-6 bg-white">
          <div className="max-w-7xl mx-auto space-y-16">
            <div className="text-center max-w-3xl mx-auto space-y-4">
              <h2 className="text-3xl font-headline font-bold text-primary sm:text-4xl">What the Scanner Measures</h2>
              <p className="text-muted-foreground text-lg">Our multi-dimensional scan engine analyzes your presence across the entire AI ecosystem.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Target,
                  title: "AI Visibility",
                  desc: "Overall frequency and prominence in AI-generated responses for your core industry keywords."
                },
                {
                  icon: BarChart3,
                  title: "Competitor Presence",
                  desc: "How often LLMs recommend your rivals vs. you for generic buyer queries."
                },
                {
                  icon: ShieldCheck,
                  title: "Description Accuracy",
                  desc: "Evaluating if AI models correctly summarize your capabilities, history, and unique value proposition."
                },
                {
                  icon: Globe,
                  title: "Location Coverage",
                  desc: "Performance analysis across specific regional and geographical discovery intents."
                },
                {
                  icon: LineChart,
                  title: "Citation Strength",
                  desc: "Analysis of the quantity and authority of the sources AI uses to validate your business."
                },
                {
                  icon: Zap,
                  title: "Service Taxonomy",
                  desc: "How well AI categorizes your various offerings into the correct market segments."
                }
              ].map((item, i) => (
                <div key={i} className="p-8 rounded-2xl border bg-background hover:border-primary/20 hover:shadow-lg transition-all group">
                  <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-colors">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-primary mb-3">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-primary text-white py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <Search className="w-6 h-6 text-accent" />
            <span className="text-2xl font-bold font-headline">VizAI Discovery</span>
          </div>
          <div className="flex gap-8 text-sm">
            <Link href="#" className="hover:text-accent transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-accent transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-accent transition-colors">Contact Support</Link>
          </div>
          <div className="text-primary-foreground/60 text-xs">
            &copy; {new Date().getFullYear()} VizAI Consulting Group. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
