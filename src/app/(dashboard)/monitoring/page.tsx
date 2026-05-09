"use client";

/**
 * @fileOverview /monitoring — Scheduled scan management dashboard.
 *
 * Fetches scan schedules from GET /api/scan-schedules.
 * Admins can create, enable/disable, and update schedules.
 * Clients see a read-only view of active monitoring.
 *
 * All data: Postgres-backed via ScanScheduleRepository.
 * No Firestore dependencies.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  Activity,
  Calendar,
  Clock,
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plus,
  History,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { intervalLabel } from "@/lib/utils/schedule";
import type { RecurrenceInterval } from "@prisma/client";
import { TruthPublishPanel } from "@/components/publishing/truth-publish-panel";

// ── Inline types ───────────────────────────────────────────────────────────────

type ScheduleItem = {
  id: string;
  company_profile_id: string;
  business_name: string;
  website_url: string | null;
  interval: RecurrenceInterval;
  is_active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  models_to_use: string[];
  created_at: string;
};

type ProfileOption = {
  id: string;
  business_name: string;
};

const INTERVALS: RecurrenceInterval[] = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add schedule dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedInterval, setSelectedInterval] = useState<RecurrenceInterval>("MONTHLY");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Data fetching ────────────────────────────────────────────

  const loadSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/scan-schedules");
      if (!res.ok) throw new Error("Failed to load schedules");
      const data = await res.json();
      setSchedules(data.schedules ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Load company profiles when Add dialog opens
  const handleOpenAdd = async () => {
    setFormError(null);
    setSelectedProfileId("");
    setSelectedInterval("MONTHLY");

    try {
      const res = await fetch("/api/company-profiles");
      if (!res.ok) throw new Error("Failed to load company profiles");
      const data = await res.json();

      // Only offer profiles that don't have an active schedule
      const scheduledProfileIds = new Set(
        schedules.filter((s) => s.is_active).map((s) => s.company_profile_id),
      );
      const options: ProfileOption[] = (data.profiles ?? [])
        .filter((p: { id: string; business_name: string; is_active: boolean }) =>
          p.is_active && !scheduledProfileIds.has(p.id),
        )
        .map((p: { id: string; business_name: string }) => ({
          id: p.id,
          business_name: p.business_name,
        }));

      setProfileOptions(options);
      setAddOpen(true);
    } catch {
      toast({ title: "Error", description: "Could not load profiles.", variant: "destructive" });
    }
  };

  // ── Create schedule ──────────────────────────────────────────

  const handleCreate = async () => {
    if (!selectedProfileId) {
      setFormError("Please select a company profile.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/scan-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_profile_id: selectedProfileId,
          interval: selectedInterval,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create schedule.");
        return;
      }
      setAddOpen(false);
      toast({ title: "Schedule Created", description: "Automated monitoring is now active." });
      setLoading(true);
      await loadSchedules();
    } catch {
      setFormError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle schedule ──────────────────────────────────────────

  const handleToggle = async (schedule: ScheduleItem) => {
    const newActive = !schedule.is_active;
    // Optimistic update
    setSchedules((prev) =>
      prev.map((s) => (s.id === schedule.id ? { ...s, is_active: newActive } : s)),
    );
    try {
      const res = await fetch(`/api/scan-schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newActive }),
      });
      if (!res.ok) throw new Error("Failed to update schedule");
      const data = await res.json();
      // Sync server-computed nextRunAt
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === schedule.id ? { ...s, next_run_at: data.next_run_at } : s,
        ),
      );
      toast({
        title: newActive ? "Schedule Enabled" : "Schedule Disabled",
        description: `Monitoring ${newActive ? "resumed" : "paused"} for ${schedule.business_name}.`,
      });
    } catch {
      // Revert optimistic update
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? { ...s, is_active: !newActive } : s)),
      );
      toast({
        title: "Update Failed",
        description: "Could not update schedule.",
        variant: "destructive",
      });
    }
  };

  // ── Update interval ──────────────────────────────────────────

  const handleIntervalChange = async (schedule: ScheduleItem, interval: RecurrenceInterval) => {
    try {
      const res = await fetch(`/api/scan-schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      if (!res.ok) throw new Error("Failed to update interval");
      const data = await res.json();
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === schedule.id
            ? { ...s, interval: data.interval, next_run_at: data.next_run_at }
            : s,
        ),
      );
      toast({ title: "Frequency Updated", description: `${schedule.business_name} will run ${intervalLabel(interval).toLowerCase()}.` });
    } catch {
      toast({ title: "Update Failed", description: "Could not update frequency.", variant: "destructive" });
    }
  };

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Loading monitoring schedules...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground font-medium">{error}</p>
        <Button variant="outline" onClick={() => { setLoading(true); loadSchedules(); }}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Activity className="w-8 h-8 text-accent" />
            Intelligence Monitoring
          </h2>
          <p className="text-muted-foreground">
            Automated AI visibility scans. Runs on your chosen schedule, no manual trigger needed.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleOpenAdd} className="flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Add Schedule
          </Button>
        )}
      </div>

      {/* ── Schedule cards ── */}
      {schedules.length > 0 ? (
        <div className="grid gap-4">
          {schedules.map((schedule) => (
            <Card
              key={schedule.id}
              className={cn(
                "border shadow-sm overflow-hidden bg-white transition-opacity",
                !schedule.is_active && "opacity-60",
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 py-4 px-6">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm",
                      schedule.is_active ? "bg-primary" : "bg-muted-foreground",
                    )}
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-primary">
                      {schedule.business_name}
                    </CardTitle>
                    {schedule.website_url && (
                      <CardDescription className="text-xs">
                        {schedule.website_url}
                      </CardDescription>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={schedule.is_active ? "default" : "outline"}
                    className={
                      schedule.is_active
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "text-muted-foreground"
                    }
                  >
                    {schedule.is_active ? "Active" : "Disabled"}
                  </Badge>
                  {isAdmin && (
                    <button
                      onClick={() => handleToggle(schedule)}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title={schedule.is_active ? "Disable schedule" : "Enable schedule"}
                    >
                      {schedule.is_active ? (
                        <ToggleRight className="w-7 h-7 text-primary" />
                      ) : (
                        <ToggleLeft className="w-7 h-7" />
                      )}
                    </button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {/* Frequency */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Frequency
                    </div>
                    {isAdmin ? (
                      <Select
                        value={schedule.interval}
                        onValueChange={(val) =>
                          handleIntervalChange(schedule, val as RecurrenceInterval)
                        }
                        disabled={!schedule.is_active}
                      >
                        <SelectTrigger className="h-9 bg-muted/30 border-none text-sm font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INTERVALS.map((iv) => (
                            <SelectItem key={iv} value={iv}>
                              {intervalLabel(iv)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm font-medium text-primary">
                        {intervalLabel(schedule.interval)}
                      </div>
                    )}
                  </div>

                  {/* Last run */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <History className="w-3 h-3" /> Last Run
                    </div>
                    <div className="text-sm font-medium text-primary">
                      {formatDate(schedule.last_run_at)}
                    </div>
                    {schedule.last_run_at && (
                      <div className="text-[10px] text-green-600 font-bold uppercase">
                        Completed
                      </div>
                    )}
                  </div>

                  {/* Next run */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Next Run
                    </div>
                    <div className="text-sm font-medium text-primary">
                      {schedule.is_active ? formatDate(schedule.next_run_at) : "—"}
                    </div>
                  </div>

                  {/* Status indicator */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Status
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center",
                          schedule.is_active
                            ? "bg-green-50 text-green-600"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {schedule.is_active ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-primary">
                          {schedule.is_active ? "Operational" : "Idle"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {schedule.is_active ? "Auto-scanning" : "Paused"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* ── Empty state ── */
        <Card className="border-dashed border-2 p-12 text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-muted rounded-full">
              <Activity className="w-12 h-12 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-primary">No monitoring schedules</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              {isAdmin
                ? "Add a schedule to start automated AI visibility monitoring for your company profiles."
                : "No monitoring schedules have been configured yet. Contact your administrator."}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={handleOpenAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Schedule
            </Button>
          )}
        </Card>
      )}

      {/* ── Canonical Truth Publishing — ADMIN only ── */}
      {isAdmin && <TruthPublishPanel />}

      {/* ── Info card ── */}
      <Card className="border-none shadow-sm bg-primary text-white overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" />
            How automated monitoring works
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm leading-relaxed opacity-80">
            Each schedule runs a full AI perception scan on your configured frequency. Scans are
            triggered automatically and results appear in your Scans history. This builds the
            longitudinal dataset needed to track visibility changes over time.
          </p>
        </CardContent>
      </Card>

      {/* ── Add Schedule Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Monitoring Schedule</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Company profile selector */}
            <div className="space-y-1.5">
              <Label>Company Profile</Label>
              {profileOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  All active company profiles already have schedules. Disable an existing
                  schedule or add a new company profile first.
                </p>
              ) : (
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a company profile…" />
                  </SelectTrigger>
                  <SelectContent>
                    {profileOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.business_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Frequency selector */}
            <div className="space-y-1.5">
              <Label>Scan Frequency</Label>
              <Select
                value={selectedInterval}
                onValueChange={(v) => setSelectedInterval(v as RecurrenceInterval)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((iv) => (
                    <SelectItem key={iv} value={iv}>
                      {intervalLabel(iv)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                First scan will run {intervalLabel(selectedInterval).toLowerCase()} from today.
              </p>
            </div>

            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || profileOptions.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create Schedule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
