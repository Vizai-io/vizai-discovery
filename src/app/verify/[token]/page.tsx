/**
 * WP-21C â€” public customer verification worksheet: /verify/[token]
 *
 * No platform login. The token in the URL is validated server-side; an
 * invalid or expired token shows a generic message (never which failure).
 * Facts are loaded directly from Prisma, scoped to the token's profile.
 *
 * Interaction lives in the client component (./worksheet-client.tsx).
 * Nothing here auto-increments a Canon version or publishes â€” approval
 * and publish remain ADMIN-only steps.
 */

import { verifyTruthVerifyToken } from "@/lib/auth/truth-verify-token";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import VerifyWorksheet, { type WorksheetFact } from "./worksheet-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verify your business facts | VizAI",
  description: "Review and confirm the facts VizAI holds about your business.",
};

function InvalidLink() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Verification link unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This verification link is invalid or has expired. Please ask VizAI
            to send you a fresh link.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyTruthVerifyToken(token);
  if (!payload) return <InvalidLink />;

  const profile = await db.companyProfile.findFirst({
    where: { id: payload.companyProfileId, organizationId: payload.organizationId },
    select: { id: true, businessName: true, websiteUrl: true },
  });
  if (!profile) return <InvalidLink />;

  const claims = await db.truthClaim.findMany({
    where: {
      companyProfileId: profile.id,
      organizationId: payload.organizationId,
    },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      category: true,
      statement: true,
      truthType: true,
      verificationState: true,
      status: true,
      sourceUrl: true,
      evidenceRequired: true,
      key: true,
    },
  });

  const facts: WorksheetFact[] = claims.map((c) => ({
    id: c.id,
    category: c.category,
    statement: c.statement,
    truthType: c.truthType,
    verificationState: c.verificationState,
    status: c.status,
    sourceUrl: c.sourceUrl,
    evidenceRequired: c.evidenceRequired,
    key: c.key,
  }));

  return (
    <VerifyWorksheet
      token={token}
      businessName={profile.businessName}
      websiteUrl={profile.websiteUrl}
      facts={facts}
    />
  );
}
