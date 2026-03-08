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
  ChevronLeft
} from "lucide-react";
import Link from "next/link";

export default function AdminPage() {
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
          <Button variant="outline" className="gap-2">
            <Database className="w-4 h-4" /> Seed Sample Data
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white gap-2">
            <Plus className="w-4 h-4" /> New Organization
          </Button>
        </div>
      </header>

      <main className="p-8 space-y-8">
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
              <p className="text-[10px] text-muted-foreground font-bold">12 Active Demos</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Scans Run</CardTitle>
              <Settings className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">8,591</div>
              <p className="text-[10px] text-green-600 font-bold">System uptime: 99.9%</p>
            </CardContent>
          </Card>
        </div>

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
                  { name: "Acme Corp", domain: "acme.com", status: "active", profiles: 5 },
                  { name: "Globex Inc", domain: "globex.ai", status: "active", profiles: 12 },
                  { name: "Soylent Corp", domain: "soylent.io", status: "demo", profiles: 1 },
                  { name: "Hooli", domain: "hooli.com", status: "inactive", profiles: 0 },
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
