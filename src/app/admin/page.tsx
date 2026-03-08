"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Building2, 
  Database, 
  Plus, 
  MoreHorizontal,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  RefreshCcw
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { DemoSeeder } from "@/lib/services/demo-seeder";
import { toast } from "@/hooks/use-toast";
import { collection, getDocs, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase-config";

export default function AdminPage() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [stats, setStats] = useState({ orgs: 0, scans: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const orgsSnap = await getDocs(collection(db, "companyProfiles"));
      const scansSnap = await getDocs(collection(db, "scans"));
      setStats({ orgs: orgsSnap.size, scans: scansSnap.size });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      await Promise.all([
        DemoSeeder.seedDemoForIndustry("logistics"),
        DemoSeeder.seedDemoForIndustry("warehousing"),
        DemoSeeder.seedDemoForIndustry("manufacturing"),
        DemoSeeder.seedDemoForIndustry("legal"),
      ]);
      
      toast({
        title: "System Seeded",
        description: "Created 4 demo organizations with full audit histories.",
      });
      fetchStats();
    } catch (error) {
      console.error("Seeding error:", error);
      toast({
        title: "Seeding Failed",
        description: "Verify Firestore connectivity in console.",
        variant: "destructive",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background animate-in fade-in duration-500">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
             <Button variant="ghost" size="icon" className="rounded-full"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-headline font-bold text-primary">Admin Control Center</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2 border-primary/20"
            onClick={handleSeedData}
            disabled={isSeeding}
          >
            {isSeeding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Seed Demo Data
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> New Client
          </Button>
        </div>
      </header>

      <main className="p-8 space-y-8 max-w-7xl mx-auto">
        {/* Stats Row */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">System Users</CardTitle>
              <Users className="w-4 h-4 text-primary opacity-40" />
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="text-3xl font-black text-primary">1,248</div>}
              <p className="text-[10px] text-green-600 font-bold mt-1">+12% Monthly Growth</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Managed Organizations</CardTitle>
              <Building2 className="w-4 h-4 text-primary opacity-40" />
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="text-3xl font-black text-primary">{stats.orgs}</div>}
              <p className="text-[10px] text-muted-foreground font-bold mt-1">{stats.orgs > 4 ? "Live Ecosystem" : "Demo Environment"}</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Audits Performed</CardTitle>
              <RefreshCcw className="w-4 h-4 text-primary opacity-40" />
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="text-3xl font-black text-primary">{stats.scans}</div>}
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Multi-Vector Vector Analysis</p>
            </CardContent>
          </Card>
        </div>

        {/* Organizations Table */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-lg font-bold text-primary">Organization Management</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest">Organization Identity</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Domain</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Type</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Status</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest text-right">Control</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Acme Logistics", domain: "acme-logistics.ai", status: "demo", type: "3PL Logistics" },
                  { name: "StorageMax Solutions", domain: "storagemax.io", status: "demo", type: "Warehousing" },
                  { name: "Precision Parts Corp", domain: "precisionparts.mfg", status: "demo", type: "Manufacturing" },
                  { name: "Justice & Partners", domain: "justice-partners.law", status: "demo", type: "Legal" },
                  { name: "Globex Inc", domain: "globex.ai", status: "active", type: "Enterprise SaaS" },
                ].map((org, i) => (
                  <TableRow key={i} className="hover:bg-muted/30 transition-colors group">
                    <TableCell className="px-8 py-5 font-bold text-primary group-hover:text-accent transition-colors">{org.name}</TableCell>
                    <TableCell className="px-6 py-5 text-muted-foreground font-medium">{org.domain}</TableCell>
                    <TableCell className="px-6 py-5">
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-tighter bg-muted/50">
                        {org.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-5">
                      <Badge variant={org.status === 'active' ? 'default' : 'secondary'} className="capitalize text-[10px] h-5">
                        {org.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-5 text-right">
                      <Button variant="ghost" size="sm" className="font-bold text-primary text-xs hover:bg-primary/5">Impersonate</Button>
                      <Button variant="ghost" size="icon" className="ml-2 text-muted-foreground"><MoreHorizontal className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}