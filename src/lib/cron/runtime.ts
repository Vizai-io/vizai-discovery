import crypto from "node:crypto";
import { NextResponse } from "next/server";

export function authorizeCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const supplied = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(cronSecret ?? "");
  const authorized = Boolean(cronSecret) &&
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function resolveInternalAppBaseUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();

  if (configuredUrl) {
    const parsed = new URL(configuredUrl);
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
    }
    return parsed.toString().replace(/\/+$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "http://localhost:9002";
}
