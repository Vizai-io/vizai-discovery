"use client";

/**
 * @fileOverview ConsultationRequestDialog
 *
 * Previously wrote to Firestore addDoc — now POSTs to /api/consultation-request
 * which persists to Postgres and fires a notification via NotificationService.
 *
 * No Firebase imports. No addDoc. No serverTimestamp.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Send } from "lucide-react";

const consultationSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  company: z.string().min(2, "Company name is required"),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  serviceInterest: z.string().min(1, "Please select a service interest"),
  notes: z.string().optional(),
});

type ConsultationFormValues = z.infer<typeof consultationSchema>;

interface ConsultationRequestDialogProps {
  sourceScanId?: string;
  trigger?: React.ReactNode;
  defaultValues?: Partial<ConsultationFormValues>;
}

export function ConsultationRequestDialog({
  sourceScanId,
  trigger,
  defaultValues,
}: ConsultationRequestDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    reset,
  } = useForm<ConsultationFormValues>({
    resolver: zodResolver(consultationSchema),
    defaultValues: {
      serviceInterest: "Strategy Optimization",
      ...defaultValues,
    },
  });

  const onSubmit = async (data: ConsultationFormValues) => {
    setLoading(true);
    try {
      // Assemble the message field from company + website + notes
      const messageParts = [
        `Company: ${data.company}`,
        data.website ? `Website: ${data.website}` : null,
        data.notes ? `Notes: ${data.notes}` : null,
        sourceScanId ? `Source scan: ${sourceScanId}` : null,
      ].filter(Boolean);
      const message =
        messageParts.length > 0 ? messageParts.join("\n") : "(No additional context provided)";

      const res = await fetch("/api/consultation-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: data.name,
          contactEmail: data.email,
          serviceInterest: data.serviceInterest,
          message,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      toast({
        title: "Request Submitted",
        description: "A VizAI consultant will contact you within 24 hours.",
      });
      setOpen(false);
      reset();
    } catch (error: any) {
      console.error("Consultation request error:", error);
      toast({
        title: "Submission Failed",
        description: error?.message ?? "Please try again or contact support directly.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-accent text-primary font-bold">Request Optimization Plan</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <DialogTitle className="text-xl font-bold">Consultation Briefing</DialogTitle>
          </div>
          <DialogDescription>
            Connect with our strategy team to discuss implementing technical entity signals and
            improving your AI discoverability index.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Contact Name</Label>
              <Input id="name" placeholder="John Doe" {...register("name")} />
              {errors.name && (
                <p className="text-[10px] text-destructive font-bold">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" placeholder="john@company.com" {...register("email")} />
              {errors.email && (
                <p className="text-[10px] text-destructive font-bold">{errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" placeholder="Acme Global" {...register("company")} />
              {errors.company && (
                <p className="text-[10px] text-destructive font-bold">{errors.company.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website (Optional)</Label>
              <Input id="website" placeholder="https://acme.ai" {...register("website")} />
              {errors.website && (
                <p className="text-[10px] text-destructive font-bold">{errors.website.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceInterest">Primary Service Interest</Label>
            <Select
              defaultValue="Strategy Optimization"
              onValueChange={(val) => setValue("serviceInterest", val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Strategy Optimization">
                  Discovery Strategy Optimization
                </SelectItem>
                <SelectItem value="Entity Markup">Entity Signal Implementation</SelectItem>
                <SelectItem value="Competitor Displacement">
                  Competitor Displacement Analysis
                </SelectItem>
                <SelectItem value="Full Visibility Audit">Bespoke Multi-Vector Audit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Context / Goals</Label>
            <Textarea
              id="notes"
              placeholder="Tell us about your visibility goals..."
              className="min-h-[80px]"
              {...register("notes")}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="submit"
              className="w-full bg-primary text-white font-bold gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing Lead...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Request Strategic Consultation
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
