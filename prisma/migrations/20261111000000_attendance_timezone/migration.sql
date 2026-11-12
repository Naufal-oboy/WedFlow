-- Reporting timezone only; existing UTC timestamps and attendance remain intact.
ALTER TABLE "Event" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';
