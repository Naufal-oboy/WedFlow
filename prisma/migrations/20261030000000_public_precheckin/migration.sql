-- CreateEnum
BEGIN;
CREATE TYPE "PrecheckinStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "CheckinMethod" ADD VALUE 'PUBLIC_PRECHECKIN';

-- CreateTable
CREATE TABLE "PrecheckinRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "submittedName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "queueCode" TEXT NOT NULL,
    "status" "PrecheckinStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "processedById" TEXT,
    "invitationId" TEXT,
    "checkinLogId" TEXT,

    CONSTRAINT "PrecheckinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecheckinRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrecheckinRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrecheckinRequest_tokenHash_key" ON "PrecheckinRequest"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PrecheckinRequest_checkinLogId_key" ON "PrecheckinRequest"("checkinLogId");

-- CreateIndex
CREATE INDEX "PrecheckinRequest_eventId_status_createdAt_id_idx" ON "PrecheckinRequest"("eventId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PrecheckinRequest_status_expiresAt_idx" ON "PrecheckinRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PrecheckinRequest_invitationId_idx" ON "PrecheckinRequest"("invitationId");

-- CreateIndex
CREATE INDEX "PrecheckinRequest_processedById_idx" ON "PrecheckinRequest"("processedById");

-- CreateIndex
CREATE UNIQUE INDEX "PrecheckinRequest_eventId_queueCode_key" ON "PrecheckinRequest"("eventId", "queueCode");

-- CreateIndex
CREATE INDEX "PrecheckinRateLimit_expiresAt_idx" ON "PrecheckinRateLimit"("expiresAt");

-- AddForeignKey
ALTER TABLE "PrecheckinRequest" ADD CONSTRAINT "PrecheckinRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecheckinRequest" ADD CONSTRAINT "PrecheckinRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecheckinRequest" ADD CONSTRAINT "PrecheckinRequest_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecheckinRequest" ADD CONSTRAINT "PrecheckinRequest_checkinLogId_fkey" FOREIGN KEY ("checkinLogId") REFERENCES "CheckinLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrecheckinRequest" ADD CONSTRAINT "PrecheckinRequest_shape_check" CHECK (
  char_length("submittedName") BETWEEN 2 AND 100 AND "tokenHash" ~ '^[a-f0-9]{64}$'
  AND "queueCode" ~ '^[A-F0-9]{8}$' AND "expiresAt" > "createdAt"
  AND (("status" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "invitationId" IS NOT NULL AND "checkinLogId" IS NOT NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "verifiedAt" IS NULL AND "invitationId" IS NULL AND "checkinLogId" IS NULL)
    OR ("status" IN ('PENDING', 'EXPIRED') AND "verifiedAt" IS NULL AND "cancelledAt" IS NULL AND "invitationId" IS NULL AND "checkinLogId" IS NULL))
);
ALTER TABLE "PrecheckinRateLimit" ADD CONSTRAINT "PrecheckinRateLimit_count_check" CHECK ("count" > 0);
COMMIT;
