
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  History,
  Plus,
  ArrowRight,
  Loader2,
  Filter,
  ShieldCheck,
  Zap,
  BarChart3,
  Calendar,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ── Inline type for perception scan list item ─────────────────────────────────

type ScanListItem = {
  id: string;
  status: string;
  businessName: string;
  websiteUrl: string | null;
  createdAt: string;
  completedAt: string | null;
  accuracyScore: number | null;
  coverageScore: number | null;
  entityUnderstandingScore: number | null;
  consistencyScore: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeOverallScore(scan: ScanListItem): number {
  const scores = [
    scan.accuracyScore,
    scan.coverageScore,
    scan.entityUnderstandingScore,
    scan.consistencyScore,
  ].filter((s): s is number => s !== null && s !== undefined);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

function statusStyle(status: string): string {
  if (status === "COMPLETE") return "bg-green-50 text-green-700 border-green-200";
  if (status === "FAILED") return "bg-red-50 text-red-700 border-red-200";
  if (status === "RUNNING") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-muted text-muted-foreground border-border";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    COMPLETE: "Completed",
    FAILED: "Failed",
    RUNNING: "Running",
    PENDING: "Pending",
  };
  return map[status] ?? status.toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ScansListPage() {
  const { userProfile } = useAuth();
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScans() {
      setLoading(true);
      try {
        const res = await fetch("/api/perception-scans?limit=50");
        if (!res.ok) return;
        const data = await res.json();
        setScans(data.scans);
      } catch (error) {
        console.error("Error fetching scans:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchScans();
  }, []);

  const avgVisibility =
    scans.length > 0
      ? (
          scans.reduce((acc, s) => acc + computeOverallScore(s), 0) / scans.length
        ).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Search className="w-8 h-8 text-accent" />
            Intelligence Inventory
          </h2>
          <p className="text-muted-foreground">
            A chronological record of multi-vector AI discoverability audits.
          </p>
        </div>
        {userProfile?.role === "admin" && (
          <Link href="/scans/new">
            <Button className="bg-primary hover:bg-primary/90 text-white gap-2 shadow-lg shadow-primary/20 h-12 px-6 rounded-full font-bold">
              <Plus className="w-5 h-5" /> Launch New Audit
            </Button>
          </Link>
        )}
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid md:grid-cols-4 gap-6">
        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardHeader className="pb-2 border-b bg-muted/10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              Total Audits{" "}
              <BarChart3 className="w-3 h-3 opacity-40 group-hover:text-accent group-hover:opacity-100 transition-all" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-primary">{scans.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1 font-bold">
              Comprehensive Multi-Vector Audits
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardHeader className="pb-2 border-b bg-muted/10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              Avg Visibility{" "}
              <Zap className="w-3 h-3 opacity-40 group-hover:text-accent group-hover:opacity-100 transition-all" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-primary">{avgVisibility}</div>
            <p className="text-[10px] text-muted-foreground mt-1 font-bold">
              Portfolio Index Mean
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardHeader className="pb-2 border-b bg-muted/10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              Growth Yield{" "}
              <ShieldCheck className="w-3 h-3 opacity-40 group-hover:text-accent group-hover:opacity-100 transition-all" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-green-600">+4.8</div>
            <p className="text-[10px] text-muted-foreground mt-1 font-bold">
              Avg. Uplift Per Cycle
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-primary text-white overflow-hidden">
          <CardHeader className="pb-2 border-b bg-white/10">
            <CardTitle className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center justify-between">
              Audit Health <Calendar className="w-3 h-3 opacity-40 text-accent" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-accent">100%</div>
            <p className="text-[10px] text-white/40 mt-1 font-bold">
              Signal Accuracy Success Rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Scan Table ── */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/10 py-4 px-8">
          <div>
            <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <History className="w-5 h-5 text-accent" />
              Historical Scan Records
            </CardTitle>
            <CardDescription className="text-xs">
              Comprehensive history of brand discoverability metrics
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-primary/10 h-8 text-[10px] font-bold uppercase tracking-widest"
          >
            <Filter className="w-3 h-3" /> Filter Results
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-4 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-medium">Hydrating audit records...</p>
            </div>
          ) : scans.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="pl-8 font-bold uppercase text-[10px] tracking-widest">
                      Audit Date
                    </TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest">
                      Client Organization
                    </TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest text-center">
                      Index Score
                    </TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest">
                      Status
                    </TableHead>
                    <TableHead className="pr-8 font-bold uppercase text-[10px] tracking-widest text-right">
                      Data View
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scans.map((scan) => {
                    const date = new Date(scan.createdAt);
                    const score = computeOverallScore(scan);
                    return (
                      <TableRow
                        key={scan.id}
                        className="hover:bg-muted/20 transition-colors group"
                      >
                        <TableCell className="pl-8 py-5">
                          <div className="text-sm font-medium text-primary">
                            {date.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-bold">
                            {date.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <div className="font-bold text-primary">{scan.businessName}</div>
                              <div className="text-[10px] text-muted-foreground font-medium">
                                {scan.websiteUrl || "—"}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="text-lg font-black text-primary">
                            {scan.status === "COMPLETE" ? score : "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] font-bold h-5 px-2",
                              statusStyle(scan.status),
                            )}
                          >
                            {statusLabel(scan.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-8 text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/scans/results/${scan.id}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="font-bold text-primary text-[10px] uppercase h-8 hover:bg-primary/5"
                              >
                                Analytics
                              </Button>
                            </Link>
                            <Link href={`/scans/report/${scan.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="font-bold text-primary text-[10px] uppercase h-8 border-primary/10 hover:bg-primary/5"
                              >
                                Report <ArrowRight className="w-3 h-3 ml-1" />
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-20 text-center space-y-4">
              <div className="bg-muted/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                <Search className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-muted-foreground italic text-sm">
                {userProfile?.role === "admin"
                  ? "No historical audits detected. Initiate your first discovery scan."
                  : "No audits available yet. Contact VizAI to schedule a scan."}
              </p>
              {userProfile?.role === "admin" && (
                <Link href="/scans/new">
                  <Button
                    variant="outline"
                    className="h-10 px-6 rounded-full font-bold text-xs uppercase tracking-widest"
                  >
                    Start First Audit
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
