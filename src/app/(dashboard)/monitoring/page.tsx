
"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { CompanyProfile } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Activity, 
  Calendar, 
  Clock, 
  RefreshCcw, 
  Search, 
  ShieldCheck, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  Settings2,
  History
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function MonitoringPage() {
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfiles() {
      setLoading(true);
      try {
        const q = query(collection(db, "companyProfiles"), where("organizationId", "==", "org_default_acme"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => {
            const d = doc.data();
            return { 
                id: doc.id, 
                ...d,
                // Ensure defaults for mock monitoring if missing
                monitoringFrequency: d.monitoringFrequency || 'off',
                lastScanAt: d.lastScanAt || Timestamp.now()
            } as CompanyProfile;
        });
        setProfiles(data);
      } catch (error) {
        console.error("Error fetching profiles:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchProfiles();
  }, []);

  const handleUpdateFrequency = async (profileId: string, frequency: string) => {
    try {
      const profileRef = doc(db, "companyProfiles", profileId);
      
      // Calculate next scan date mock
      let nextDate = new Date();
      if (frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      if (frequency === 'biweekly') nextDate.setDate(nextDate.getDate() + 14);
      if (frequency === 'monthly') nextDate.setDate(nextDate.getDate() + 30);

      await updateDoc(profileRef, {
        monitoringFrequency: frequency,
        nextScanAt: frequency === 'off' ? null : Timestamp.fromDate(nextDate)
      });

      setProfiles(prev => prev.map(p => p.id === profileId ? { 
        ...p, 
        monitoringFrequency: frequency as any,
        nextScanAt: frequency === 'off' ? null : Timestamp.fromDate(nextDate)
      } : p));

      toast({
        title: "Schedule Updated",
        description: `Monitoring frequency set to ${frequency}.`,
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not update scan schedule.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Loading monitoring schedules...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Activity className="w-8 h-8 text-accent" />
            Intelligence Monitoring
          </h2>
          <p className="text-muted-foreground">Automate AI visibility scans and track historical shifts.</p>
        </div>
      </div>

      <div className="grid gap-6">
        {profiles.length > 0 ? (
          profiles.map((profile) => (
            <Card key={profile.id} className="border-none shadow-sm overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 py-4 px-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-primary">{profile.name}</CardTitle>
                    <CardDescription className="text-xs">{profile.industry} • {profile.targetGeography}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <Badge variant={profile.monitoringFrequency === 'off' ? 'outline' : 'default'} className={profile.monitoringFrequency !== 'off' ? "bg-green-50 text-green-700 border-green-200" : ""}>
                      {profile.monitoringFrequency === 'off' ? 'Monitoring Disabled' : `Active: ${profile.monitoringFrequency}`}
                   </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid md:grid-cols-4 gap-8 items-start">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Scan Frequency
                      </label>
                      <Select 
                        value={profile.monitoringFrequency || 'off'} 
                        onValueChange={(val) => handleUpdateFrequency(profile.id, val)}
                      >
                        <SelectTrigger className="w-full bg-muted/30 border-none h-10 font-medium">
                          <SelectValue placeholder="Select Frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Disabled</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2 border-x px-6">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <History className="w-3 h-3" /> Last Completed
                    </div>
                    {profile.lastScanAt ? (
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-primary">
                          {profile.lastScanAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="text-[9px] text-muted-foreground font-medium">
                          Status: <span className="text-green-600 font-bold uppercase">Successful</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">No historical scans</div>
                    )}
                  </div>

                  <div className="space-y-2 border-r pr-6">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Next Scheduled
                    </div>
                    {profile.nextScanAt ? (
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-primary">
                          {profile.nextScanAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="text-[9px] text-accent font-bold uppercase">
                          24 Vector Analysis
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">Scheduling disabled</div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <RefreshCcw className="w-3 h-3" /> System Health
                    </div>
                    <div className="flex items-center gap-3">
                       <div className={cn(
                         "w-8 h-8 rounded-full flex items-center justify-center",
                         profile.monitoringFrequency !== 'off' ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"
                       )}>
                         {profile.monitoringFrequency !== 'off' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                       </div>
                       <div>
                         <div className="text-xs font-bold text-primary">
                           {profile.monitoringFrequency !== 'off' ? 'Operational' : 'Idle'}
                         </div>
                         <p className="text-[9px] text-muted-foreground">
                           {profile.monitoringFrequency !== 'off' ? 'Endpoint Ready' : 'Enable to start'}
                         </p>
                       </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-dashed border-2 p-12 text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-muted rounded-full">
                <Search className="w-12 h-12 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-primary">No Monitoring Profiles Found</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">Create a new visibility scan profile to enable automated monitoring and historical tracking.</p>
            </div>
            <Button asChild className="bg-primary text-white">
              <a href="/scans/new">Create Your First Profile</a>
            </Button>
          </Card>
        )}
      </div>

      <Card className="border-none shadow-sm bg-primary text-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-accent" />
            Monitoring Logic
          </CardTitle>
          <Badge className="bg-accent text-primary font-bold">Engine v1.2</Badge>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <p className="text-sm leading-relaxed opacity-80">
            Monitoring automatically triggers multi-vector discovery audits on your selected frequency. This builds the historical data required for the <strong>Optimization Scenario</strong> engine to accurately track your visibility uplift over time.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
