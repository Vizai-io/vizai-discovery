"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { CompanyProfile } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Globe, 
  Target, 
  ArrowRight, 
  Loader2, 
  ExternalLink,
  MapPin,
  Layers,
  History,
  Activity,
  Plus
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function CompaniesPage() {
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfiles() {
      setLoading(true);
      try {
        const q = query(collection(db, "companyProfiles"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CompanyProfile));
        setProfiles(data);
      } catch (error) {
        console.error("Error fetching profiles:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchProfiles();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Building2 className="w-8 h-8 text-accent" />
            Entity Management
          </h2>
          <p className="text-muted-foreground">Monitored corporate entities and discovery taxonomy definitions.</p>
        </div>
        <Link href="/scans/new">
          <Button className="bg-primary hover:bg-primary/90 text-white gap-2 shadow-lg shadow-primary/20 h-12 px-6 rounded-full font-bold">
            <Plus className="w-5 h-5" /> Add New Entity
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-muted-foreground font-medium uppercase tracking-[0.2em] text-[10px] font-bold">Aggregating Entity Map...</p>
        </div>
      ) : profiles.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((profile) => (
            <Card key={profile.id} className="border-none shadow-sm hover:shadow-xl transition-all duration-300 bg-white overflow-hidden flex flex-col group">
              <CardHeader className="bg-primary/5 pb-6 border-b relative">
                <div className="absolute top-4 right-4">
                  <Badge className="bg-white/80 text-primary border-primary/10 text-[8px] uppercase font-bold tracking-widest backdrop-blur-sm">
                    {profile.industry}
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                    <Building2 className="w-7 h-7" />
                  </div>
                  <div className="space-y-0.5">
                    <CardTitle className="text-xl font-bold text-primary">{profile.name}</CardTitle>
                    <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                      <Globe className="w-3 h-3 text-accent" /> {profile.targetGeography}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6 flex-1 flex flex-col">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                      <Layers className="w-3 h-3" /> Capabilities
                    </div>
                    <div className="text-xs font-bold text-primary">{profile.serviceCategories?.length || 0} Domains</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                      <Target className="w-3 h-3" /> Rivals
                    </div>
                    <div className="text-xs font-bold text-primary">{profile.competitors?.length || 0} Tracked</div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 flex-1">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Primary Discovery Vectors</div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.serviceCategories?.slice(0, 3).map((cat, i) => (
                      <Badge key={i} variant="secondary" className="bg-muted/50 text-primary border-none text-[9px] font-bold h-5 px-2">
                        {cat}
                      </Badge>
                    ))}
                    {(profile.serviceCategories?.length || 0) > 3 && (
                      <Badge variant="outline" className="text-[9px] font-bold h-5 px-2 border-primary/10">
                        +{(profile.serviceCategories?.length || 0) - 3} More
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      profile.monitoringFrequency !== 'off' ? "bg-green-50 animate-pulse" : "bg-slate-300"
                    )} />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {profile.monitoringFrequency !== 'off' ? `Active: ${profile.monitoringFrequency}` : 'Idle'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/monitoring`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/5">
                        <Activity className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href={`/scans/new`}>
                      <Button size="sm" className="h-8 gap-1.5 bg-primary text-white text-[10px] font-bold uppercase tracking-widest px-4 rounded-full">
                        Audit <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-2 py-24 text-center space-y-6 bg-muted/10">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
            <Building2 className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div className="space-y-2 max-w-sm mx-auto px-6">
            <h3 className="text-xl font-bold text-primary">No Entities Tracked</h3>
            <p className="text-sm text-muted-foreground italic">Add your organization or client profiles to start mapping their AI discovery footprint.</p>
          </div>
          <Link href="/scans/new">
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-12 px-8 rounded-full shadow-lg">Create First Profile</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
