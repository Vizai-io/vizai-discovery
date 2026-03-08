"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Building2, 
  Database, 
  Settings, 
  Plus, 
  MoreHorizontal,
  ChevronLeft,
  Loader2,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DemoSeeder } from "@/lib/services/demo-seeder";
import { toast } from "@/hooks/use-toast";

export default function AdminPage() {
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      // Seed all main industries
      await Promise.all([
        DemoSeeder.seedDemoForIndustry("logistics"),
        DemoSeeder.seedDemoForIndustry("warehousing"),
        DemoSeeder.seedDemoForIndustry("manufacturing"),
        DemoSeeder.seedDemoForIndustry("legal"),
      ]);
      
      toast({
        title: "System Seeded",
        description: "Created 4 demo organizations and initial scans.",
      });
    } catch (error) {
      console.error("Seeding error:", error);
      toast({
        title: "Seeding Failed",
        description: "Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
             <Button variant="ghost" size="icon"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <h1 className="text-xl font-headline font-bold text-primary">Admin Control Center</h1>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleSeedData}
            disabled={isSeeding}
          >
            {isSeeding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Seed Sample Data
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white gap-2">
            <Plus className="w-4 h-4" /> New Organization
          </Button>
        </div>
      </header>

      <main className="p-8 space-y-8">
        {/* Stats Row */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Users</CardTitle>
              <Users className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,248</div>
              <p className="text-[10px] text-green-600 font-bold">+12% from last month</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Organizations</CardTitle>
              <Building2 className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">48</div>
              <p className="text-[10px] text-muted-foreground font-bold">4 Demo Active</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">System Status</CardTitle>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Operational</div>
              <p className="text-[10px] text-muted-foreground font-bold">API Latency: 42ms</p>
            </CardContent>
          </Card>
        </div>

        {/* Organizations Table */}
        <Card className="border-none shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">Manage Organizations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold uppercase text-[10px] px-6">Organization Name</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6">Domain</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6">Status</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6">Total Profiles</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Acme Logistics", domain: "acme-logistics.ai", status: "demo", profiles: 1 },
                  { name: "StorageMax Solutions", domain: "storagemax.io", status: "demo", profiles: 1 },
                  { name: "Precision Parts Corp", domain: "precisionparts.mfg", status: "demo", profiles: 1 },
                  { name: "Justice & Partners", domain: "justice-partners.law", status: "demo", profiles: 1 },
                  { name: "Globex Inc", domain: "globex.ai", status: "active", profiles: 12 },
                ].map((org, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TableCell className="px-6 py-4 font-bold text-primary">{org.name}</TableCell>
                    <TableCell className="px-6 py-4 text-muted-foreground">{org.domain}</TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge variant={org.status === 'active' ? 'default' : org.status === 'demo' ? 'secondary' : 'outline'} className="capitalize">
                        {org.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-4 font-medium">{org.profiles}</TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" className="gap-2">
                         Impersonate
                      </Button>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
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
