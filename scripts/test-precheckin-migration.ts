import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const migration = (await readFile("prisma/migrations/20261030000000_public_precheckin/migration.sql", "utf8")).replace(/^BEGIN;|^COMMIT;/gm, "");
  const timezoneMigration = (await readFile("prisma/migrations/20261031000000_precheckin_timezone/migration.sql", "utf8")).replace(/^BEGIN;|^COMMIT;/gm, "");
  await db.connect();
  try {
    await db.query("BEGIN");
    const schema = `precheckin_migration_${randomUUID().replaceAll("-", "")}`;
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET LOCAL search_path TO "${schema}", public`);
    await db.query("SET LOCAL TIME ZONE 'Asia/Kuala_Lumpur'");
    await db.query(`CREATE TYPE "CheckinMethod" AS ENUM ('QR','NAME_SEARCH','MANUAL');
      CREATE TABLE "Event" (id TEXT PRIMARY KEY);
      CREATE TABLE "User" (id TEXT PRIMARY KEY);
      CREATE TABLE "Invitation" (id TEXT PRIMARY KEY, "checkedInCount" INTEGER);
      CREATE TABLE "CheckinLog" (id TEXT PRIMARY KEY, count INTEGER, method "CheckinMethod");
      INSERT INTO "Event" VALUES ('event'); INSERT INTO "User" VALUES ('staff');
      INSERT INTO "Invitation" VALUES ('invitation',2);
      INSERT INTO "CheckinLog" VALUES ('log',2,'MANUAL');`);
    await db.query(migration);
    await db.query(`INSERT INTO "PrecheckinRequest" ("id","eventId","submittedName","tokenHash","queueCode","createdAt","expiresAt")
      VALUES ('pending','event','Family',repeat('a',64),'ABCD1234',CURRENT_TIMESTAMP AT TIME ZONE 'UTC',(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '20 minutes');
      INSERT INTO "PrecheckinRateLimit" VALUES ('bucket',1,CURRENT_TIMESTAMP + INTERVAL '10 minutes');`);
    await db.query(timezoneMigration);
    const lifetime = await db.query('SELECT EXTRACT(EPOCH FROM ("expiresAt" - CURRENT_TIMESTAMP))::int AS remaining FROM "PrecheckinRequest"');
    assert.equal(lifetime.rows[0].remaining, 1200);
    assert.equal((await db.query('SELECT EXTRACT(EPOCH FROM ("expiresAt" - CURRENT_TIMESTAMP))::int AS remaining FROM "PrecheckinRateLimit"')).rows[0].remaining, 600);
    assert.equal((await db.query('SELECT "checkedInCount" FROM "Invitation"')).rows[0].checkedInCount, 2);
    assert.deepEqual((await db.query('SELECT * FROM "CheckinLog"')).rows, [{ id: "log", count: 2, method: "MANUAL" }]);
    await db.query("SAVEPOINT invalid_transition");
    await assert.rejects(db.query(`UPDATE "PrecheckinRequest" SET "status"='VERIFIED' WHERE id='pending'`), /PrecheckinRequest_shape_check/);
    await db.query("ROLLBACK TO SAVEPOINT invalid_transition");
    await db.query("SAVEPOINT invalid_reference");
    await assert.rejects(db.query(`UPDATE "PrecheckinRequest" SET "eventId"='other' WHERE id='pending'`), /PrecheckinRequest_eventId_fkey/);
    await db.query("ROLLBACK TO SAVEPOINT invalid_reference");
    console.log("Pre-check-in migrations: existing attendance preserved, lifecycle constraints and foreign keys enforced, UTC ticket and local limiter instants preserved under Asia/Kuala_Lumpur; isolated schema rolled back.");
  } finally { await db.query("ROLLBACK"); await db.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
