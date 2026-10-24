-- Additive migration: existing records retain their data and start with no account/event access links.
ALTER TABLE "Invitation" ADD COLUMN "checkedInAt" TIMESTAMP(3),
ADD COLUMN "checkedInById" TEXT,
ADD COLUMN "checkedInCount" INTEGER;
ALTER TABLE "User" ADD COLUMN "clientId" TEXT;

CREATE TABLE "EventStaff" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventStaff_pkey" PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "EventStaff_userId_idx" ON "EventStaff"("userId");
CREATE INDEX "User_clientId_idx" ON "User"("clientId");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
