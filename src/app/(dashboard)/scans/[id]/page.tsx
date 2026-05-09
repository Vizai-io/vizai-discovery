/**
 * Legacy scan detail page — permanent redirect to Postgres-backed results page.
 *
 * The old /scans/[id] page used a Firestore onSnapshot listener against the
 * legacy `scans` collection. All new scans are persisted to Postgres only and
 * served from /scans/results/[id].
 *
 * This server component immediately redirects to the correct route.
 * No Firestore imports. No client-side code.
 */

import { redirect } from "next/navigation";

export default async function LegacyScanDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  redirect(`/scans/results/${id}`);
}
