-- Additive migration: all existing clients remain active; no rows are removed.
BEGIN;
CREATE TYPE "ClientType" AS ENUM ('COUPLE', 'WEDDING_ORGANIZER');
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "Client"
  ADD COLUMN "type" "ClientType" NOT NULL DEFAULT 'COUPLE',
  ADD COLUMN "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX "Client_status_createdAt_idx" ON "Client"("status", "createdAt");
CREATE INDEX "Event_eventDate_idx" ON "Event"("eventDate");
CREATE INDEX "Event_status_eventDate_idx" ON "Event"("status", "eventDate");
COMMIT;
