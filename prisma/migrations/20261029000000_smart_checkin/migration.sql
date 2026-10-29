BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TYPE "CheckinMethod" AS ENUM ('QR', 'NAME_SEARCH', 'MANUAL');
CREATE TABLE "CheckinLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invitationId" TEXT NOT NULL REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" TEXT NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "count" INTEGER NOT NULL CHECK ("count" > 0),
  "method" "CheckinMethod" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "legacy" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "CheckinLog_eventId_createdAt_id_idx" ON "CheckinLog"("eventId", "createdAt", "id");
CREATE INDEX "CheckinLog_invitationId_createdAt_idx" ON "CheckinLog"("invitationId", "createdAt");
CREATE INDEX "CheckinLog_userId_idx" ON "CheckinLog"("userId");
CREATE INDEX "Invitation_guestName_trgm_idx" ON "Invitation" USING GIN (lower("guestName") gin_trgm_ops);

-- Fail atomically on inconsistent legacy data; never invent counts or timestamps.
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_attendance_valid" CHECK (
  "guestQuota" > 0 AND COALESCE("checkedInCount", 0) BETWEEN 0 AND "guestQuota"
  AND (("checkedInAt" IS NULL AND COALESCE("checkedInCount", 0) = 0)
    OR ("checkedInAt" IS NOT NULL AND "checkedInCount" IS NOT NULL AND "checkedInCount" > 0))
);
-- One historical arrival per previously checked-in invitation. The old endpoint
-- used manual codes; legacy=true distinguishes imported history from new arrivals.
INSERT INTO "CheckinLog" ("id", "invitationId", "eventId", "userId", "count", "method", "createdAt", "legacy")
SELECT 'legacy:' || "id", "id", "eventId", "checkedInById", "checkedInCount", 'MANUAL', "checkedInAt", true
FROM "Invitation" WHERE "checkedInAt" IS NOT NULL;

COMMIT;
