
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-6">
      <div className="relative">
        <div className="bg-primary/5 p-8 rounded-full">
          <Search className="w-16 h-16 text-primary opacity-20" />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-xl border border-primary/10">
          <AlertCircle className="w-8 h-8 text-accent" />
        </div>
      </div>
      
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-primary tracking-tighter">Route Not Found</h1>
        <p className="text-muted-foreground max-w-sm mx-auto">
          The requested intelligence vector does not exist or has been moved to a different discovery path.
        </p>
      </div>

      <Link href="/dashboard">
        <Button className="bg-primary hover:bg-primary/90 text-white gap-2 shadow-lg shadow-primary/20 h-12 px-8 rounded-full">
          <ChevronLeft className="w-4 h-4" /> Return to Command Center
        </Button>
      </Link>

      <div className="pt-12 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">
        VizAI Intelligence • v1.4.2
      </div>
    </div>
  );
}
