/**
 * @fileOverview Admin Consultation Pipeline — Sprint 4 migration.
 *
 * Previously read/wrote to Firestore `consultationRequests` collection.
 * Now: reads/writes via GET|PATCH /api/admin/leads (Postgres).
 *
 * Field mapping (Firestore → Postgres):
 *   name          → contactName
 *   email         → contactEmail
 *   company       → (no direct equivalent — use message context)
 *   createdAt.toDate() → createdAt (ISO string from Postgres)
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  ChevronLeft,
  Loader2,
  Mail,
  ExternalLink,
  Clock,
  ArrowRight,
  MoreHorizontal
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Postgres ConsultationRequest shape (from Prisma)
type PgLead = {
  id:             string;
  organizationId: string;
  contactName:    string;
  contactEmail:   string;
  contactPhone:   string | null;
  message:        string;
  serviceInterest: string | null;
  status:         string;
  createdAt:      string;
  updatedAt:      string;
};

// Free-scan lead shape (WP-22 single lead store — scans under the free-scan org)
type FreeScanLead = {
  scanId:         string;
  businessName:   string;
  website:        string | null;
  email:          string | null;
  requestContact: boolean;
  overallScore:   number | null;
  source:         'website' | 'platform';
  createdAt:      string;
};

const STATUS_CONFIGS: Record<string, { label: string; className: string }> = {
  pending:          { label: 'New Lead',       className: 'bg-blue-50 text-blue-700 border-blue-200' },
  reviewed:         { label: 'Reviewed',       className: 'bg-purple-50 text-purple-700 border-purple-200' },
  closed:           { label: 'Closed',         className: 'bg-green-50 text-green-700 border-green-200' },
};

const LEAD_STATUSES = ['pending', 'reviewed', 'closed'];

function getStatusBadge(status: string) {
  const config = STATUS_CONFIGS[status];
  if (config) {
    return <Badge className={cn("border", config.className)}>{config.label}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

export default function LeadsAdminPage() {
  const [leads, setLeads] = useState<PgLead[]>([]);
  const [freeScanLeads, setFreeScanLeads] = useState<FreeScanLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/leads');
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setLeads(data.leads);
      setFreeScanLeads(data.freeScanLeads ?? []);
    } catch (e) {
      console.error("Error fetching leads:", e);
      toast({ title: "Load Error", description: "Could not fetch consultation pipeline.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, newStatus }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);

      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
      toast({ title: "Status Updated", description: `Lead status changed to ${newStatus}.` });
    } catch (e) {
      toast({ title: "Update Failed", variant: "destructive" });
    }
  };

  const pendingCount   = leads.filter(l => l.status === 'pending').length;
  const reviewedCount  = leads.filter(l => l.status === 'reviewed').length;
  const closedCount    = leads.filter(l => l.status === 'closed').length;

  return (
    <div className="min-h-screen bg-background pb-20 animate-in fade-in duration-500">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/admin">
             <Button variant="ghost" size="icon" className="rounded-full"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-headline font-bold text-primary">Consultation Pipeline</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Refresh Pipeline
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <div className="grid md:grid-cols-4 gap-6">
           <Card className="border-none shadow-sm bg-white">
             <CardHeader className="pb-2">
               <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase">New Requests</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-3xl font-black text-primary">{pendingCount}</div>
             </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-white">
             <CardHeader className="pb-2">
               <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase">Total Pipeline</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-3xl font-black text-primary">{leads.length}</div>
             </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-white">
             <CardHeader className="pb-2">
               <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase">Under Review</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-3xl font-black text-accent">{reviewedCount}</div>
             </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-green-50/50 border border-green-100">
             <CardHeader className="pb-2">
               <CardTitle className="text-[10px] font-bold text-green-700 uppercase">Closed</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-3xl font-black text-green-700">{closedCount}</div>
             </CardContent>
           </Card>
        </div>

        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-muted/10 py-4 px-8">
            <CardTitle className="text-lg font-bold text-primary">Lead Intake Queue</CardTitle>
            <CardDescription className="text-xs">Professional services opportunities — Postgres source.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading && leads.length === 0 ? (
              <div className="py-20 flex flex-col items-center gap-4 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="font-medium">Hydrating lead data...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-8 font-bold uppercase text-[10px] tracking-widest">Intake Date</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Contact</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Service Interest</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Status</TableHead>
                      <TableHead className="pr-8 font-bold uppercase text-[10px] tracking-widest text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id} className="hover:bg-muted/20 transition-colors group">
                        <TableCell className="pl-8 py-5">
                          <div className="text-sm font-medium">
                            {new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-primary">{lead.contactName}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5" /> {lead.contactEmail}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-semibold text-primary">{lead.serviceInterest ?? '—'}</div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="focus:outline-none">{getStatusBadge(lead.status)}</button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuLabel>Update Status</DropdownMenuLabel>
                              {LEAD_STATUSES.map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  onClick={() => handleUpdateStatus(lead.id, s)}
                                  className="capitalize"
                                >
                                  {s}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="pr-8 text-right">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuLabel>Lead Actions</DropdownMenuLabel>
                               <DropdownMenuItem onClick={() => {
                                 navigator.clipboard.writeText(lead.contactEmail);
                                 toast({ title: "Email Copied" });
                               }}>Copy Email</DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                    {leads.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-20 text-center text-muted-foreground italic">
                          No consultation requests found in the pipeline.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Free scan leads — WP-22 single lead store (D1) */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-muted/10 py-4 px-8 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg font-bold text-primary">Free Scan Leads</CardTitle>
              <CardDescription className="text-xs">
                Website and platform free scans with captured contact details — free-scan org, Postgres source.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-[10px]">
                {freeScanLeads.length} total
              </Badge>
              <Badge className="border bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                {freeScanLeads.filter(l => l.requestContact).length} contact requested
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="pl-8 font-bold uppercase text-[10px] tracking-widest">Scan Date</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest">Business</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest">Contact</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest">Score</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-widest">Source</TableHead>
                    <TableHead className="pr-8 font-bold uppercase text-[10px] tracking-widest text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freeScanLeads.map((lead) => (
                    <TableRow key={lead.scanId} className="hover:bg-muted/20 transition-colors group">
                      <TableCell className="pl-8 py-5">
                        <div className="text-sm font-medium">
                          {new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-primary">{lead.businessName}</div>
                        {lead.website && (
                          <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{lead.website}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium flex items-center gap-1">
                          <Mail className="w-2.5 h-2.5 text-muted-foreground" /> {lead.email ?? '—'}
                        </div>
                        {lead.requestContact && (
                          <Badge className="mt-1 border bg-amber-50 text-amber-700 border-amber-200 text-[9px]">
                            Contact requested
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-black text-primary">
                          {lead.overallScore != null ? Math.round(lead.overallScore) : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {lead.source === 'website' ? (
                          <Badge className="border bg-blue-50 text-blue-700 border-blue-200 text-[10px]">Website scan</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Platform teaser</Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-8 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Lead Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={!lead.email}
                              onClick={() => {
                                if (lead.email) {
                                  navigator.clipboard.writeText(lead.email);
                                  toast({ title: "Email Copied" });
                                }
                              }}
                            >
                              Copy Email
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a href={`/free-scan/results/${lead.scanId}`} target="_blank" rel="noreferrer">
                                <ExternalLink className="w-3 h-3 mr-1" /> View Teaser Page
                              </a>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {freeScanLeads.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-16 text-center text-muted-foreground italic">
                        No free scan leads yet. Website scans appear here once lmo-backend forwarding is activated.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
