/**
 * @fileOverview POST /api/scans/run — DEPRECATED
 *
 * This route has been deprecated as part of the Postgres migration.
 * The Firestore-backed scan engine is no longer operational.
 *
 * Use: POST /api/scan
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy scan route deprecated. Use /api/scan.",
      deprecated: true,
      replacement: "/api/scan",
    },
    { status: 410 },
  );
}
