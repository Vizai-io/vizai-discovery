-- Service API key management (DEC-038).
-- Additive only: one new table, no existing data touched.
-- Tokens are never stored — keyHash is the SHA-256 hex of the issued token.

-- CreateTable
CREATE TABLE "service_api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_api_keys_keyHash_key" ON "service_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "service_api_keys_organizationId_idx" ON "service_api_keys"("organizationId");

-- AddForeignKey
ALTER TABLE "service_api_keys" ADD CONSTRAINT "service_api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
