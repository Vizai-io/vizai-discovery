/**
 * @fileOverview Prisma seed script.
 *
 * Creates the required sentinel records and initial admin data.
 * Run with: npx prisma db seed
 *
 * Safe to run multiple times — uses upsert throughout.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // ── Sentinel organization ─────────────────────────────────
  // Used as a placeholder org for scans created before auth is wired in.
  // Will be re-assigned to real orgs in Phase 3.
  await db.organization.upsert({
    where: { id: "unassigned" },
    create: {
      id: "unassigned",
      name: "Unassigned",
      slug: "unassigned",
      tier: "STARTER",
      isActive: false,
    },
    update: {},
  });

  // ── Sentinel company profile ──────────────────────────────
  // Placeholder for scans without a real company profile ID.
  await db.companyProfile.upsert({
    where: { id: "unassigned" },
    create: {
      id: "unassigned",
      organizationId: "unassigned",
      businessName: "Unassigned",
      isActive: false,
    },
    update: {},
  });

  console.log("✓ Sentinel records created");
  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
