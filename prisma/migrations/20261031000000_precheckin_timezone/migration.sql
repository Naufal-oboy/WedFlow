-- Preserve UTC instants written by Prisma, independent of PostgreSQL TimeZone.
-- The prior rate limiter wrote timestamps via CURRENT_TIMESTAMP in the database
-- session zone, so its conversion intentionally uses that zone instead.
BEGIN;
ALTER TABLE "PrecheckinRequest"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "verifiedAt" TYPE TIMESTAMPTZ(3) USING "verifiedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "cancelledAt" TYPE TIMESTAMPTZ(3) USING "cancelledAt" AT TIME ZONE 'UTC';
ALTER TABLE "PrecheckinRateLimit"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE current_setting('TimeZone');
COMMIT;
