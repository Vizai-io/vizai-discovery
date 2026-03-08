
"use client";

import { useState, useEffect } from "react";
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { ConsultationRequest, LeadStatus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Briefcase, 
  ChevronLeft, 
  Loader2, 
  Mail, 
  Globe, 
  ExternalLink, 
  Filter,
  CheckCircle2,
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

export default function LeadsAdminPage() {
  const [leads, setLeads] = useState<ConsultationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "consultationRequests"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ConsultationRequest));
      setLeads(data);
    } catch (e) {
      console.error("Error fetching leads:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleUpdateStatus = async (leadId: string, newStatus: LeadStatus) => {
    try {
      await updateDoc(doc(db, "consultationRequests", leadId), {
        status: newStatus,
        lastUpdated: serverTimestamp()
      });
      
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
      
      toast({
        title: "Status Updated",
        description: `Lead status changed to ${newStatus}.`,
      });
    } catch (e) {
      toast({
        title: "Update Failed",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'new': return <Badge className="bg-blue-50 text-blue-700 border-blue-200">New Lead</Badge>;
      case 'qualified': return <Badge className="bg-purple-50 text-purple-700 border-purple-200">Qualified</Badge>;
      case 'proposal sent': return <Badge className="bg-orange-50 text-orange-700 border-orange-200">Proposal Sent</Badge>;
      case 'won': return <Badge className="bg-green-50 text-green-700 border-green-200">Won</Badge>;
      case 'lost': return <Badge variant="secondary">Lost</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

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
               <div className="text-3xl font-black text-primary">{leads.filter(l => l.status === 'new').length}</div>
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
               <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase">Proposal Phase</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-3xl font-black text-accent">{leads.filter(l => l.status === 'proposal sent').length}</div>
             </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-green-50/50 border border-green-100">
             <CardHeader className="pb-2">
               <CardTitle className="text-[10px] font-bold text-green-700 uppercase">Conversion Rate</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-3xl font-black text-green-700">
                 {leads.length > 0 ? ((leads.filter(l => l.status === 'won').length / leads.length) * 100).toFixed(0) : 0}%
               </div>
             </CardContent>
           </Card>
        </div>

        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-muted/10 py-4 px-8">
            <CardTitle className="text-lg font-bold text-primary">Lead Intake Queue</CardTitle>
            <CardDescription className="text-xs">Professional services opportunities aggregated from platform scans.</CardDescription>
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
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Contact / Company</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Service Interest</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Status</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Context</TableHead>
                      <TableHead className="pr-8 font-bold uppercase text-[10px] tracking-widest text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id} className="hover:bg-muted/20 transition-colors group">
                        <TableCell className="pl-8 py-5">
                          <div className="text-sm font-medium">{lead.createdAt?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                          <div className="text-[10px] text-muted-foreground">{lead.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-primary">{lead.name}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5" /> {lead.email}
                          </div>
                          <div className="text-[10px] font-bold text-accent uppercase mt-1">{lead.company}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-semibold text-primary">{lead.serviceInterest}</div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="focus:outline-none">{getStatusBadge(lead.status)}</button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuLabel>Update Status</DropdownMenuLabel>
                              {['new', 'qualified', 'proposal sent', 'won', 'lost'].map((s) => (
                                <DropdownMenuItem 
                                  key={s} 
                                  onClick={() => handleUpdateStatus(lead.id, s as LeadStatus)}
                                  className="capitalize"
                                >
                                  {s}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell>
                          {lead.sourceScanId ? (
                            <Link href={`/admin/scans/${lead.sourceScanId}/review`} className="flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-accent transition-colors">
                              View Scan <ArrowRight className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Direct Entry</span>
                          )}
                          {lead.website && (
                            <a href={lead.website} target="_blank" className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors mt-1">
                              <Globe className="w-2.5 h-2.5" /> Visit Site
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="pr-8 text-right">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuLabel>Lead Actions</DropdownMenuLabel>
                               <DropdownMenuItem onClick={() => {
                                 navigator.clipboard.writeText(lead.email);
                                 toast({ title: "Email Copied" });
                               }}>Copy Email</DropdownMenuItem>
                               <DropdownMenuItem className="text-destructive">Archive Lead</DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                    {leads.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-20 text-center text-muted-foreground italic">
                          No consultation requests found in the current pipeline.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
