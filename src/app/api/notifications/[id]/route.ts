/**
 * @fileOverview PATCH /api/notifications/[id]
 *
 * Mark a single notification as read.
 * Verifies the notification belongs to the authenticated org.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { db } from "@/lib/db";
import { NotificationRepository } from "@/lib/repositories";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const notification = await db.notification.findUnique({
      where: { id },
      select: { organizationId: true },
    });

    if (!notification) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }
    if (notification.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    await NotificationRepository.markRead(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error marking notification read:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update notification" },
      { status: 500 },
    );
  }
}
