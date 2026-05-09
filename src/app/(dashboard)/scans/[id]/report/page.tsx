/**
 * @fileOverview /scans/[id]/report redirect — Sprint 4.
 *
 * Previously: Firestore-backed professional report page.
 * Now: permanent redirect to /scans/results/[id] (Postgres-backed).
 *
 * The Postgres results page (scans/results/[id]/page.tsx) supersedes this.
 * This file is kept as a server-side redirect to preserve any existing deep links.
 */

import { redirect } from 'next/navigation';

export default async function ReportRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/scans/results/${id}`);
}
