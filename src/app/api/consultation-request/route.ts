/**
 * @fileOverview POST /api/consultation-request
 *
 * Replaces the Firestore addDoc path in ConsultationRequestDialog.
 * Writes consultation requests to Postgres via the ConsultationRequest model.
 *
 * Previously: dialog → Firestore addDoc → ghost project → request lost
 * Now:        dialog → POST /api/consultation-request → Postgres → NotificationService
 *
 * Refinement 1: traceId included in all log statements.
 * Refinement 4: NotificationService.consultationRequestSubmitted() fires on
 *   successful persist so the request enters the operational notification lifecycle.
 *
 * Auth: CLIENT or ADMIN role required.
 * The organizationId is resolved from the authenticated user — never trusted from
 * the request body.
 *
 * Request body (all required unless noted):
 * {
 *   contactName: string       (form: "name")
 *   contactEmail: string      (form: "email")
 *   serviceInterest?: string
 *   message: string           (assembled from company + website + notes)
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { db } from "@/lib/db";
import { NotificationService } from "@/lib/services/notification.service";

export async function POST(request: NextRequest) {
  const traceId = crypto.randomUUID();

  try {
    // ── Auth gate ─────────────────────────────────────────────────────────────
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const { contactName, contactEmail, serviceInterest, message } = body as {
      contactName?: string;
      contactEmail?: string;
      serviceInterest?: string;
      message?: string;
    };

    // ── Validate required fields ──────────────────────────────────────────────
    if (!contactName || typeof contactName !== "string" || contactName.trim().length < 2) {
      return NextResponse.json(
        { error: "contactName is required (minimum 2 characters)" },
        { status: 400 },
      );
    }
    if (!contactEmail || typeof contactEmail !== "string" || !contactEmail.includes("@")) {
      return NextResponse.json(
        { error: "contactEmail is required and must be a valid email" },
        { status: 400 },
      );
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    // ── Write to Postgres ─────────────────────────────────────────────────────
    const record = await db.consultationRequest.create({
      data: {
        organizationId: auth.organizationId,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim().toLowerCase(),
        serviceInterest: serviceInterest?.trim() ?? null,
        message: message.trim(),
        status: "pending",
      },
    });

    console.log("[consultation-request] Created", {
      traceId,
      recordId: record.id,
      organizationId: auth.organizationId,
      contactEmail: record.contactEmail,
    });

    // ── Notification (Refinement 4) — fire-and-forget ─────────────────────────
    void (async () => {
      try {
        await NotificationService.consultationRequestSubmitted(
          auth.organizationId,
          record.contactName,
          record.serviceInterest ?? "General Consultation",
        );
      } catch (notifErr: any) {
        console.error("[consultation-request] Notification error (non-fatal)", {
          traceId,
          recordId: record.id,
          error: notifErr?.message,
        });
      }
    })();

    return NextResponse.json(
      { id: record.id, createdAt: record.createdAt.toISOString() },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("[consultation-request] Unexpected error", {
      traceId,
      error: err?.message,
      code: err?.code,
    });
    return NextResponse.json(
      { error: "Failed to submit consultation request" },
      { status: 500 },
    );
  }
}
