/**
 * @fileOverview Admin Service API Keys — DEC-038 key management.
 *
 * Issues, lists, and revokes per-consumer service keys (lmo-backend,
 * NeuroOS hub, MCP, …) via GET|POST|PATCH /api/admin/api-keys.
 *
 * The plaintext token is displayed exactly once, in the post-create dialog —
 * only its SHA-256 hash is stored server-side. Revocation is final; issue a
 * new key instead of re-activating.
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KeyRound,
  ChevronLeft,
  Loader2,
  Plus,
  Copy,
  Clock,
  AlertTriangle,
  ShieldOff,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ApiKeyRow = {
  id:             string;
  name:           string;
  keyPrefix:      string;
  role:           "ADMIN" | "CLIENT";
  organizationId: string;
  isActive:       boolean;
  expiresAt:      string | null;
  lastUsedAt:     string | null;
  createdBy:      string;
  createdAt:      string;
  revokedAt:      string | null;
  organization:   { name: string };
};

type OrgOption = { id: string; name: string };

function keyStatus(key: ApiKeyRow): { label: string; className: string } {
  if (!key.isActive) {
    return { label: "Revoked", className: "bg-red-50 text-red-700 border-red-200" };
  }
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
    return { label: "Expired", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return { label: "Active", className: "bg-green-50 text-green-700 border-green-200" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ApiKeysAdminPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formOrgId, setFormOrgId] = useState("");
  const [formExpiresDays, setFormExpiresDays] = useState("");

  // Token shown-once dialog
  const [newToken, setNewToken] = useState<string | null>(null);

  // Revoke confirmation dialog
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys");
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setKeys(data.keys ?? []);
      setOrgs(data.organizations ?? []);
    } catch (e) {
      console.error("Error fetching API keys:", e);
      toast({ title: "Load Error", description: "Could not fetch service API keys.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async () => {
    if (formName.trim().length < 2 || !formOrgId) {
      toast({ title: "Missing fields", description: "Key name and organization are required.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const expiresDays = parseInt(formExpiresDays, 10);
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          organization_id: formOrgId,
          expires_in_days: Number.isFinite(expiresDays) && expiresDays > 0 ? expiresDays : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `API error ${res.status}`);
      }
      const data = await res.json();
      setCreateOpen(false);
      setFormName("");
      setFormOrgId("");
      setFormExpiresDays("");
      setNewToken(data.token);
      await fetchKeys();
    } catch (e: any) {
      toast({ title: "Create Failed", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_id: revokeTarget.id, action: "revoke" }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      toast({ title: "Key Revoked", description: `"${revokeTarget.name}" can no longer authenticate.` });
      setRevokeTarget(null);
      await fetchKeys();
    } catch {
      toast({ title: "Revoke Failed", variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  };

  const copyToken = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    toast({ title: "Token Copied", description: "Store it securely — it will not be shown again." });
  };

  const activeCount = keys.filter((k) => keyStatus(k).label === "Active").length;

  return (
    <div className="min-h-screen bg-background pb-20 animate-in fade-in duration-500">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon" className="rounded-full"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-headline font-bold text-primary">Service API Keys</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchKeys} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2 bg-primary text-white">
            <Plus className="w-4 h-4" />
            New Key
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-primary">One key per consumer</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Issue a dedicated key for each service that calls the platform (lmo-backend forwarding, NeuroOS hub, MCP).
              Keys authenticate as <code className="font-mono text-[10px]">Authorization: Bearer vizai_sk_…</code> and can be
              revoked individually without touching the others. Tokens are shown once at creation and stored only as hashes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-primary">{activeCount}<span className="text-sm font-bold text-muted-foreground ml-2">active</span></div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-muted/10 py-4 px-8">
            <CardTitle className="text-lg font-bold text-primary">Issued Keys</CardTitle>
            <CardDescription className="text-xs">Postgres source — hashes only, plaintext tokens are never stored.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading && keys.length === 0 ? (
              <div className="py-20 flex flex-col items-center gap-4 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="font-medium">Loading keys…</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-8 font-bold uppercase text-[10px] tracking-widest">Name</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Key</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Organization</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Created</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Last Used</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Expires</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-widest">Status</TableHead>
                      <TableHead className="pr-8 font-bold uppercase text-[10px] tracking-widest text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((key) => {
                      const status = keyStatus(key);
                      return (
                        <TableRow key={key.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="pl-8 py-5">
                            <div className="font-bold text-primary">{key.name}</div>
                            <div className="text-[10px] text-muted-foreground">by {key.createdBy}</div>
                          </TableCell>
                          <TableCell>
                            <code className="font-mono text-xs text-muted-foreground">{key.keyPrefix}…</code>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs font-semibold text-primary">{key.organization.name}</div>
                            <div className="text-[10px] text-muted-foreground">{key.role}</div>
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(key.createdAt)}</TableCell>
                          <TableCell className="text-xs">{key.lastUsedAt ? formatDate(key.lastUsedAt) : <span className="text-muted-foreground italic">never</span>}</TableCell>
                          <TableCell className="text-xs">{formatDate(key.expiresAt)}</TableCell>
                          <TableCell>
                            <Badge className={cn("border", status.className)}>{status.label}</Badge>
                          </TableCell>
                          <TableCell className="pr-8 text-right">
                            {key.isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 border-red-200 text-red-700 hover:bg-red-50"
                                onClick={() => setRevokeTarget(key)}
                              >
                                <ShieldOff className="w-3 h-3" /> Revoke
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {keys.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-16 text-center text-muted-foreground italic">
                          No service keys issued yet. Create one per consumer to replace the shared env-var key.
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" /> New Service Key</DialogTitle>
            <DialogDescription>
              Name the consumer this key belongs to. The token is shown once after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Key name <span className="text-destructive">*</span></Label>
              <Input
                id="key-name"
                placeholder="e.g. lmo-backend forwarding"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={creating}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Organization <span className="text-destructive">*</span></Label>
              <Select value={formOrgId} onValueChange={setFormOrgId} disabled={creating}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The org this key acts as (service intake keys use the free-scan org).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-expiry">Expires in days <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input
                id="key-expiry"
                type="number"
                min={1}
                max={3650}
                placeholder="Never"
                value={formExpiresDays}
                onChange={(e) => setFormExpiresDays(e.target.value)}
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-primary text-white gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token shown-once dialog */}
      <Dialog open={newToken !== null} onOpenChange={(open) => !open && setNewToken(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary"><KeyRound className="w-5 h-5" /> Key Created</DialogTitle>
            <DialogDescription>
              Copy this token now and store it in the consumer&apos;s environment. It cannot be retrieved again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-muted rounded-md px-3 py-2.5 break-all select-all">{newToken}</code>
              <Button variant="outline" size="icon" onClick={copyToken} title="Copy token">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Only the SHA-256 hash is stored. Once this dialog closes, the token is gone — if it is lost, revoke the key and issue a new one.</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)} className="bg-primary text-white">I&apos;ve stored it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && !revoking && setRevokeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700"><ShieldOff className="w-5 h-5" /> Revoke Key</DialogTitle>
            <DialogDescription>
              &quot;{revokeTarget?.name}&quot; ({revokeTarget?.keyPrefix}…) will stop authenticating immediately.
              Revocation is final — issue a new key to restore access for this consumer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={revoking}>Cancel</Button>
            <Button onClick={handleRevoke} disabled={revoking} variant="destructive" className="gap-2">
              {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
              Revoke Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
