
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  Globe,
  Zap,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Layers,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// ── Inline types ──────────────────────────────────────────────────────────────

type ProfileItem = {
  id: string;
  business_name: string;
  website_url: string | null;
  official_description: string | null;
  official_business_type: string | null;
  official_services: string[];
  official_locations: string[];
  official_industries: string[];
  official_differentiators: string[];
  official_customer_types: string[];
  created_at: string;
};

type OrgInfo = {
  tier: string;
  limit: number | null; // null = unlimited
  can_create: boolean;
};

type ProfileForm = {
  business_name: string;
  website_url: string;
  official_business_type: string;
  official_services: string;   // comma-separated
  official_locations: string;  // comma-separated
  official_industries: string; // comma-separated
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const emptyForm: ProfileForm = {
  business_name: "",
  website_url: "",
  official_business_type: "",
  official_services: "",
  official_locations: "",
  official_industries: "",
};

function profileToForm(p: ProfileItem): ProfileForm {
  return {
    business_name: p.business_name,
    website_url: p.website_url ?? "",
    official_business_type: p.official_business_type ?? "",
    official_services: p.official_services.join(", "),
    official_locations: p.official_locations.join(", "),
    official_industries: p.official_industries.join(", "),
  };
}

function parseList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function formToPayload(f: ProfileForm) {
  return {
    business_name: f.business_name.trim(),
    website_url: f.website_url.trim() || undefined,
    official_business_type: f.official_business_type.trim() || undefined,
    official_services: parseList(f.official_services),
    official_locations: parseList(f.official_locations),
    official_industries: parseList(f.official_industries),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";

  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProfileItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProfileItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state (shared for create + edit)
  const [form, setForm] = useState<ProfileForm>(emptyForm);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company-profiles");
      if (!res.ok) return;
      const data = await res.json();
      setProfiles(data.profiles);
      setOrgInfo({ tier: data.tier, limit: data.limit, can_create: data.can_create });
    } catch (err) {
      console.error("Error fetching company profiles:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // ── Create ────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(emptyForm);
    setFormError(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.business_name.trim()) {
      setFormError("Company name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/company-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create profile.");
        return;
      }
      // Refresh list to get full profile data
      await fetchProfiles();
      setCreateOpen(false);
      toast({ title: "Profile Created", description: `${data.business_name} added successfully.` });
    } catch {
      setFormError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────

  const openEdit = (profile: ProfileItem) => {
    setEditTarget(profile);
    setForm(profileToForm(profile));
    setFormError(null);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    if (!form.business_name.trim()) {
      setFormError("Company name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/company-profiles/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to update profile.");
        return;
      }
      const payload = formToPayload(form);
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === editTarget.id
            ? {
                ...p,
                ...payload,
                website_url: payload.website_url ?? null,
                official_business_type: payload.official_business_type ?? null,
              }
            : p,
        ),
      );
      setEditTarget(null);
      toast({ title: "Profile Updated", description: `${form.business_name} saved.` });
    } catch {
      setFormError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/company-profiles/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to remove profile.", variant: "destructive" });
        return;
      }
      setProfiles((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setOrgInfo((prev) =>
        prev ? { ...prev, can_create: profiles.length - 1 < (prev.limit ?? Infinity) } : prev,
      );
      setDeleteTarget(null);
      toast({ title: "Profile Removed", description: `${deleteTarget.business_name} has been removed.` });
    } catch {
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Building2 className="w-8 h-8 text-accent" />
            Company Profiles
          </h2>
          <p className="text-muted-foreground">
            Manage company entities monitored by your organization.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={openCreate}
            disabled={!orgInfo?.can_create}
            className="bg-primary hover:bg-primary/90 text-white gap-2 shadow-lg shadow-primary/20 h-12 px-6 rounded-full font-bold"
          >
            <Plus className="w-5 h-5" /> Add Company
          </Button>
        )}
      </div>

      {/* ── Tier Usage Banner ── */}
      {orgInfo && (
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium",
            orgInfo.can_create
              ? "bg-muted/30 border-muted text-muted-foreground"
              : "bg-amber-50 border-amber-200 text-amber-700",
          )}
        >
          {orgInfo.can_create ? (
            <Info className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>
            <strong>{orgInfo.tier}</strong> plan ·{" "}
            {profiles.length} of{" "}
            {orgInfo.limit === null ? "unlimited" : orgInfo.limit} profiles used
            {!orgInfo.can_create && " · Contact support to upgrade"}
          </span>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-muted-foreground font-medium text-sm">
            Loading company profiles...
          </p>
        </div>
      ) : profiles.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              className="border-none shadow-sm hover:shadow-xl transition-all duration-300 bg-white overflow-hidden flex flex-col group"
            >
              <CardHeader className="bg-primary/5 pb-6 border-b relative">
                {/* Industry badge */}
                {profile.official_industries[0] && (
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-white/80 text-primary border-primary/10 text-[8px] uppercase font-bold tracking-widest backdrop-blur-sm">
                      {profile.official_industries[0]}
                    </Badge>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                    <Building2 className="w-7 h-7" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <CardTitle className="text-xl font-bold text-primary truncate">
                      {profile.business_name}
                    </CardTitle>
                    {profile.website_url && (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-widest truncate">
                        <Globe className="w-3 h-3 text-accent shrink-0" />
                        {profile.website_url.replace(/^https?:\/\//, "")}
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6 flex-1 flex flex-col">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                      <Layers className="w-3 h-3" /> Services
                    </div>
                    <div className="text-xs font-bold text-primary">
                      {profile.official_services.length > 0
                        ? `${profile.official_services.length} listed`
                        : "—"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Locations
                    </div>
                    <div className="text-xs font-bold text-primary">
                      {profile.official_locations[0] ?? "—"}
                    </div>
                  </div>
                </div>

                {/* Service tags */}
                {profile.official_services.length > 0 && (
                  <div className="space-y-2 flex-1">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      Primary Services
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.official_services.slice(0, 3).map((svc, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="bg-muted/50 text-primary border-none text-[9px] font-bold h-5 px-2"
                        >
                          {svc}
                        </Badge>
                      ))}
                      {profile.official_services.length > 3 && (
                        <Badge
                          variant="outline"
                          className="text-[9px] font-bold h-5 px-2 border-primary/10"
                        >
                          +{profile.official_services.length - 3} More
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Card footer actions */}
                <div className="pt-4 border-t flex items-center justify-between">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {new Date(profile.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                  <div className="flex gap-2">
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5"
                          onClick={() => openEdit(profile)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                          onClick={() => setDeleteTarget(profile)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Link href="/scans/new">
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 bg-primary text-white text-[10px] font-bold uppercase tracking-widest px-4 rounded-full"
                          >
                            Scan <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-2 py-24 text-center space-y-6 bg-muted/10">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
            <Building2 className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div className="space-y-2 max-w-sm mx-auto px-6">
            <h3 className="text-xl font-bold text-primary">No Company Profiles</h3>
            <p className="text-sm text-muted-foreground italic">
              {isAdmin
                ? "Add your first company profile to start tracking AI visibility."
                : "No company profiles yet. Contact your administrator to get started."}
            </p>
          </div>
          {isAdmin && orgInfo?.can_create && (
            <Button
              onClick={openCreate}
              className="bg-primary hover:bg-primary/90 text-white font-bold h-12 px-8 rounded-full shadow-lg"
            >
              Add First Company
            </Button>
          )}
        </Card>
      )}

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setFormError(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Company Profile</DialogTitle>
            <DialogDescription>
              Enter the company details. Fields marked * are required.
            </DialogDescription>
          </DialogHeader>
          <ProfileFormFields form={form} onChange={setForm} error={formError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-primary text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {saving ? "Creating..." : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => { if (!open) { setEditTarget(null); setFormError(null); } }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Company Profile</DialogTitle>
            <DialogDescription>
              Update the company details below.
            </DialogDescription>
          </DialogHeader>
          <ProfileFormFields form={form} onChange={setForm} error={formError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-primary text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Remove Company Profile
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <strong>{deleteTarget?.business_name}</strong>? This will hide the
              profile from your dashboard. Existing scan records are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {saving ? "Removing..." : "Remove Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Shared form fields component ──────────────────────────────────────────────

function ProfileFormFields({
  form,
  onChange,
  error,
}: {
  form: ProfileForm;
  onChange: (f: ProfileForm) => void;
  error: string | null;
}) {
  const set = (key: keyof ProfileForm, value: string) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="space-y-4 py-2">
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-lg border border-destructive/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Company Name *</Label>
        <Input
          value={form.business_name}
          onChange={(e) => set("business_name", e.target.value)}
          placeholder="e.g. Acme Logistics"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Website URL</Label>
        <Input
          value={form.website_url}
          onChange={(e) => set("website_url", e.target.value)}
          placeholder="https://acme.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Business Type</Label>
        <Input
          value={form.official_business_type}
          onChange={(e) => set("official_business_type", e.target.value)}
          placeholder="e.g. Freight Broker, SaaS, Manufacturer"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Services</Label>
        <Textarea
          value={form.official_services}
          onChange={(e) => set("official_services", e.target.value)}
          placeholder="Comma-separated: e.g. Cold Chain, Freight Forwarding, Customs"
          rows={2}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Locations</Label>
        <Input
          value={form.official_locations}
          onChange={(e) => set("official_locations", e.target.value)}
          placeholder="Comma-separated: e.g. North America, EU"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Industries</Label>
        <Input
          value={form.official_industries}
          onChange={(e) => set("official_industries", e.target.value)}
          placeholder="Comma-separated: e.g. Logistics, Supply Chain"
        />
      </div>
    </div>
  );
}
