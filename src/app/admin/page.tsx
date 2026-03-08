
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Building2, 
  Database, 
  ChevronLeft,
  Loader2,
  ShieldCheck,
  RefreshCcw,
  Library,
  Network,
  FileSearch,
  ArrowRight,
  MoreHorizontal,
  Briefcase,
  Activity
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { DemoSeeder } from "@/lib/services/demo-seeder";
import { QueryLibraryService } from "@/lib/services/query-library-service";
import { CompetitorService } from "@/lib/services/competitor-service";
import { toast } from "@/hooks/use-toast";
import { collection, getDocs, query, orderBy, limit, where } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { ScanRecord } from "@/lib/types";

export default function AdminPage() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSeedingLibrary, setIsSeedingLibrary] = useState(false);
  const [isSeedingCompetitors, setIsSeedingCompetitors] = useState(false);
  const [stats, setStats] = useState({ orgs: 0, scans: 0, newLeads: 0 });
  const [pendingScans, setPendingScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const orgsSnap = await getDocs(collection(db, "companyProfiles"));
      const scansSnap = await getDocs(collection(db, "scans"));
      
      // Fetch new lead count
      const leadsSnap = await getDocs(query(collection(db, "consultationRequests"), where("status", "==", "new")));
      
      setStats({ 
        orgs: orgsSnap.size, 
        scans: scansSnap.size,
        newLeads: leadsSnap.size
      });

      // Fetch scans awaiting review
      const scansRef = collection(db, "scans");
      const q = query(scansRef, orderBy("date", "desc"), limit(10));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScanRecord));
      setPendingScans(data);
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
        description: "Created demo organizations with full audit histories.",
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

  const handleSeedLibrary = async () => {
    setIsSeedingLibrary(true);
    try {
      await QueryLibraryService.seedLibrary();
      toast({
        title: "Library Initialized",
        description: "Industry discovery query vectors have been seeded.",
      });
    } catch (error) {
      toast({
        title: "Library Error",
        description: "Failed to seed query library.",
        variant: "destructive",
      });
    } finally {
      setIsSeedingLibrary(false);
    }
  };

  const handleSeedCompetitors = async () => {
    setIsSeedingCompetitors(true);
    try {
      await CompetitorService.seedCompetitors();
      toast({
        title: "Competitors Initialized",
        description: "Competitor Knowledge Profiles have been seeded.",
      });
    } catch (error) {
      toast({
        title: "Seeding Error",
        description: "Failed to seed competitor profiles.",
        variant: "destructive",
      });
    } finally {
      setIsSeedingCompetitors(false);
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
          <Link href="/admin/diagnostics">
            <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5">
              <Activity className="w-4 h-4 text-accent" />
              Diagnostics
            </Button>
          </Link>
          <Link href="/admin/leads">
            <Button variant="outline" className="gap-2 border-accent text-primary font-bold bg-accent/5">
              <Briefcase className="w-4 h-4 text-accent" />
              Manage Pipeline ({stats.newLeads})
            </Button>
          </Link>
          <Button 
            variant="outline" 
            className="gap-2 border-primary/20"
            onClick={handleSeedLibrary}
            disabled={isSeedingLibrary}
          >
            {isSeedingLibrary ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Library className="w-4 h-4" />
            )}
            Seed Library
          </Button>
          <Button 
            variant="outline" 
            className="gap-2 border-primary/20"
            onClick={handleSeedCompetitors}
            disabled={isSeedingCompetitors}
          >
            {isSeedingCompetitors ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Network className="w-4 h-4" />
            )}
            Seed Competitors
          </Button>
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
        </div>
      </header>

      <main className="p-8 space-y-8 max-w-7xl mx-auto">
        {/* Stats Row */}
        <div className="grid md:grid-cols-4 gap-6">
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
          <Card className="border-none shadow-sm bg-primary text-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Active Leads</CardTitle>
              <Briefcase className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="text-3xl font-black">{stats.newLeads}</div>}
              <Link href="/admin/leads" className="text-[10px] font-bold text-accent hover:underline mt-1 flex items-center gap-1">
                View Pipeline <ArrowRight className="w-3 h-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Human Review Queue */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-primary/5 flex flex-row items-center justify-between py-4 px-8">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-accent" />
                Human Review Workflow
              </CardTitle>
              <CardDescription className="text-xs">Audit and approve AI-generated discovery findings</CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest border-primary/20">Quality Control</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest">Scan Date</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Client / Organization</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest text-center">Score</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Review Status</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingScans.map((scan, i) => (
                  <TableRow key={i} className="hover:bg-muted/30 transition-colors group">
                    <TableCell className="px-8 py-4 text-sm font-medium">
                      {scan.date?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </TableCell>
                    <TableCell className="px-6 py-4 font-bold text-primary group-hover:text-accent transition-colors">
                      {scan.results?.companyName || "Client Account"}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-center font-black text-primary">
                      {scan.results?.overallScore.toFixed(1)}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge 
                        variant={scan.reviewStatus === 'approved' ? 'default' : 'secondary'} 
                        className={cn(
                          "capitalize text-[10px] h-5",
                          scan.reviewStatus === 'approved' && "bg-green-50 text-green-700 border-green-200"
                        )}
                      >
                        {scan.reviewStatus || 'draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-4 text-right">
                      <Link href={`/admin/scans/${scan.id}/review`}>
                        <Button variant="ghost" size="sm" className="font-bold text-primary text-xs hover:bg-primary/5 gap-1.5">
                          Review Audit <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {pendingScans.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={5} className="py-12 text-center text-muted-foreground italic">
                        No scans found in the database.
                     </TableCell>
                   </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Organizations Table */}
        <Card className="border-none shadow-sm overflow-hidden bg-white opacity-50">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-lg font-bold text-primary">Organization Management (View Only)</CardTitle>
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
                      <Button variant="ghost" size="icon" className="text-muted-foreground"><MoreHorizontal className="w-4 h-4" /></Button>
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
