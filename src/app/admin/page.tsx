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
  Briefcase,
  Zap,
  AlertTriangle,
  RotateCcw,
  Activity,
  BarChart2,
  Clock,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { DemoSeeder } from "@/lib/services/demo-seeder";
import { QueryLibraryService } from "@/lib/services/query-library-service";
import { CompetitorService } from "@/lib/services/competitor-service";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AdminStats = {
  orgCount: number;
  userCount: number;
  totalScans: number;
  pendingLeads: number;
};

type RecentScan = {
  id: string;
  businessName: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  accuracyScore: number | null;
  coverageScore: number | null;
  organizationId: string;
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  tier: string;
  profileCount: number;
  createdAt: string;
};

type UserRow = {
  id:               string;
  email:            string;
  displayName:      string | null;
  role:             string;
  organizationId:   string;
  provisioningState: "PENDING_ORG_ASSIGNMENT" | "COMPLETE";
  lastLoginAt:      string | null;
  createdAt:        string;
  organization: {
    name:     string;
    slug:     string;
    isActive: boolean;
  } | null;
};

const TIER_LABELS: Record<string, string> = {
  STARTER: "Starter",
  PROFESSIONAL: "Professional",
  ENTERPRISE: "Enterprise",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETE: "bg-green-50 text-green-700 border-green-200",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

export default function AdminPage() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSeedingLibrary, setIsSeedingLibrary] = useState(false);
  const [isSeedingCompetitors, setIsSeedingCompetitors] = useState(false);
  const [stats, setStats] = useState<AdminStats>({ orgCount: 0, userCount: 0, totalScans: 0, pendingLeads: 0 });
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── User management state ──────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [replayingUserId, setReplayingUserId] = useState<string | null>(null);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to fetch admin stats");
      const data = await res.json();
      setStats(data.stats);
      setRecentScans(data.recentScans);
      setOrganizations(data.organizations);
    } catch (e) {
      console.error(e);
      toast({ title: "Load Error", description: "Could not load admin stats.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      console.error(e);
      toast({ title: "Users Load Error", description: "Could not load user list.", variant: "destructive" });
    } finally {
      setUsersLoading(false);
    }
  };

  const handleReplayProvisioning = async (userId: string) => {
    setReplayingUserId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "replay_provisioning" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Replay Failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Provisioning Replayed", description: `User ${data.email} re-provisioned successfully.` });
      fetchUsers();
    } catch (e) {
      toast({ title: "Error", description: "Failed to replay provisioning.", variant: "destructive" });
    } finally {
      setReplayingUserId(null);
    }
  };

  const handleAssignOrg = async (userId: string, organizationId: string) => {
    setAssigningUserId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, organizationId, action: "assign_org" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Assignment Failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Org Assigned", description: `User moved to ${organizationId}.` });
      fetchUsers();
    } catch (e) {
      toast({ title: "Error", description: "Failed to assign organization.", variant: "destructive" });
    } finally {
      setAssigningUserId(null);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchUsers();
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
        description: "Verify database connectivity in console.",
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

  const handleTierChange = async (orgId: string, newTier: string) => {
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: newTier }),
      });
      if (!res.ok) throw new Error("Failed to update tier");
      setOrganizations(prev =>
        prev.map(o => (o.id === orgId ? { ...o, tier: newTier } : o))
      );
      toast({ title: "Tier Updated", description: `Organization tier set to ${TIER_LABELS[newTier] ?? newTier}.` });
    } catch (e) {
      toast({ title: "Update Failed", description: "Could not update tier.", variant: "destructive" });
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
          <Link href="/admin/forecasting">
            <Button variant="outline" className="gap-2 border-primary/20 text-primary">
              <TrendingUp className="w-4 h-4" />
              Forecasting
            </Button>
          </Link>
          <Link href="/admin/memory">
            <Button variant="outline" className="gap-2 border-primary/20 text-primary">
              <Clock className="w-4 h-4" />
              Memory
            </Button>
          </Link>
          <Link href="/admin/continuity">
            <Button variant="outline" className="gap-2 border-primary/20 text-primary">
              <BarChart2 className="w-4 h-4" />
              Continuity
            </Button>
          </Link>
          <Link href="/admin/operations">
            <Button variant="outline" className="gap-2 border-primary/20 text-primary">
              <Activity className="w-4 h-4" />
              Operations
            </Button>
          </Link>
          <Link href="/admin/scan-test">
            <Button variant="outline" className="gap-2 border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100">
              <Zap className="w-4 h-4" />
              Quick Test
            </Button>
          </Link>
          <Link href="/admin/leads">
            <Button variant="outline" className="gap-2 border-accent text-primary font-bold bg-accent/5">
              <Briefcase className="w-4 h-4 text-accent" />
              Manage Pipeline ({stats.pendingLeads})
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
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="text-3xl font-black text-primary">{stats.userCount}</div>}
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Active Accounts</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Managed Organizations</CardTitle>
              <Building2 className="w-4 h-4 text-primary opacity-40" />
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="text-3xl font-black text-primary">{stats.orgCount}</div>}
              <p className="text-[10px] text-muted-foreground font-bold mt-1">{stats.orgCount > 4 ? "Live Ecosystem" : "Demo Environment"}</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Perception Scans</CardTitle>
              <RefreshCcw className="w-4 h-4 text-primary opacity-40" />
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="text-3xl font-black text-primary">{stats.totalScans}</div>}
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Multi-Model Analysis</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-primary text-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Active Leads</CardTitle>
              <Briefcase className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="text-3xl font-black">{stats.pendingLeads}</div>}
              <Link href="/admin/leads" className="text-[10px] font-bold text-accent hover:underline mt-1 flex items-center gap-1">
                View Pipeline <ArrowRight className="w-3 h-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Recent Scans */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-primary/5 flex flex-row items-center justify-between py-4 px-8">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-accent" />
                Recent Perception Scans
              </CardTitle>
              <CardDescription className="text-xs">Latest AI perception audit results across all organizations</CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest border-primary/20">All Orgs</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest">Scan Date</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Business</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest text-center">Accuracy</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest text-center">Coverage</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Status</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentScans.map((scan) => (
                  <TableRow key={scan.id} className="hover:bg-muted/30 transition-colors group">
                    <TableCell className="px-8 py-4 text-sm font-medium">
                      {new Date(scan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </TableCell>
                    <TableCell className="px-6 py-4 font-bold text-primary group-hover:text-accent transition-colors">
                      {scan.businessName}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-center font-black text-primary">
                      {scan.accuracyScore != null ? scan.accuracyScore.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-center font-black text-primary">
                      {scan.coverageScore != null ? scan.coverageScore.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className={cn("capitalize text-[10px] h-5", STATUS_COLORS[scan.status] ?? "")}
                      >
                        {scan.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-4 text-right">
                      <Link href={`/scans/results/${scan.id}`}>
                        <Button variant="ghost" size="sm" className="font-bold text-primary text-xs hover:bg-primary/5 gap-1.5">
                          View Report <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {recentScans.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={6} className="py-12 text-center text-muted-foreground italic">
                        No scans found in the database.
                     </TableCell>
                   </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Organizations & Tier Management */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-lg font-bold text-primary">Organization & Tier Management</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Assign service tiers to client organizations. Tiers determine scan batching in the Batch Scan Runner.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest">Organization</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Company Profiles</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Service Tier</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.length > 0 ? organizations.map((org) => (
                  <TableRow key={org.id} className="hover:bg-muted/30 transition-colors group">
                    <TableCell className="px-8 py-5 font-bold text-primary group-hover:text-accent transition-colors">{org.name}</TableCell>
                    <TableCell className="px-6 py-5">
                      <Badge variant="outline" className="text-[10px] font-bold bg-muted/50">{org.profileCount} profiles</Badge>
                    </TableCell>
                    <TableCell className="px-6 py-5">
                      <Select value={org.tier} onValueChange={(val) => handleTierChange(org.id, val)}>
                        <SelectTrigger className="w-[140px] h-8 text-xs font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STARTER">Starter</SelectItem>
                          <SelectItem value="PROFESSIONAL">Professional</SelectItem>
                          <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="px-6 py-5 text-muted-foreground text-xs">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic">No organizations found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {/* User Management (Sprint 3 — Task 7) */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-muted/10 flex flex-row items-center justify-between py-4 px-8">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                User Management
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Provisioned users · Assign orgs · Replay provisioning for failed accounts
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs font-bold border-primary/20"
              onClick={fetchUsers}
              disabled={usersLoading}
            >
              {usersLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest">Email</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Display Name</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Organization</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">State</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-6 tracking-widest">Last Login</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] px-8 tracking-widest text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground italic">
                      No users found in the database.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => {
                    const isPending = u.provisioningState === "PENDING_ORG_ASSIGNMENT";
                    return (
                      <TableRow
                        key={u.id}
                        className={cn(
                          "hover:bg-muted/30 transition-colors group",
                          isPending && "bg-amber-50/60 hover:bg-amber-50",
                        )}
                      >
                        <TableCell className="px-8 py-4 text-sm font-medium text-primary">
                          <div className="flex items-center gap-2">
                            {isPending && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            {u.email}
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                          {u.displayName ?? "—"}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          {isPending ? (
                            <div className="flex items-center gap-2">
                              <Select
                                value={u.organizationId}
                                onValueChange={(val) => handleAssignOrg(u.id, val)}
                                disabled={assigningUserId === u.id}
                              >
                                <SelectTrigger className="w-[160px] h-8 text-xs font-bold border-amber-300">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned" disabled>— Unassigned —</SelectItem>
                                  {organizations
                                    .filter((o) => o.id !== "unassigned" && o.id !== "free-scan")
                                    .map((o) => (
                                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                    ))
                                  }
                                </SelectContent>
                              </Select>
                              {assigningUserId === u.id && <Loader2 className="w-3 h-3 animate-spin text-amber-600" />}
                            </div>
                          ) : (
                            <span className="text-sm font-bold text-primary">{u.organization?.name ?? u.organizationId}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] font-black uppercase tracking-widest h-5",
                              isPending
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-green-50 text-green-700 border-green-200",
                            )}
                          >
                            {isPending ? "Pending Org" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-xs text-muted-foreground">
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                            : "Never"
                          }
                        </TableCell>
                        <TableCell className="px-8 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="font-bold text-primary text-xs hover:bg-primary/5 gap-1.5"
                            onClick={() => handleReplayProvisioning(u.id)}
                            disabled={replayingUserId === u.id}
                            title="Replay provisioning — re-runs upsertOnLogin to repair this user's Postgres row"
                          >
                            {replayingUserId === u.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RotateCcw className="w-3.5 h-3.5" />
                            }
                            Replay
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
