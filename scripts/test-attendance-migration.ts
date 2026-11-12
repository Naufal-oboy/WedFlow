import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const migration = await readFile("prisma/migrations/20261111000000_attendance_timezone/migration.sql", "utf8");
  const indexMigration = (await readFile("prisma/migrations/20261112000000_attendance_export_index/migration.sql", "utf8")).replace(/^BEGIN;|^COMMIT;/gm, "");
  await db.connect();
  try {
    await db.query("BEGIN");
    const schema = `attendance_migration_${randomUUID().replaceAll("-", "")}`;
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET LOCAL search_path TO "${schema}"`);
    await db.query("SET LOCAL TIME ZONE 'Asia/Makassar'");
    await db.query(`CREATE TABLE "Event" (id TEXT PRIMARY KEY, "eventDate" TIMESTAMP(3));
      CREATE TABLE "Invitation" (id TEXT PRIMARY KEY, "eventId" TEXT);
      CREATE INDEX "Invitation_eventId_idx" ON "Invitation"("eventId");
      CREATE TABLE "CheckinLog" (id TEXT PRIMARY KEY, count INTEGER, "createdAt" TIMESTAMP(3));
      INSERT INTO "Event" VALUES ('old', '2026-11-11 17:05:00');
      INSERT INTO "CheckinLog" VALUES ('arrival', 3, '2026-11-11 17:05:00');`);
    await db.query(migration);
    await db.query(indexMigration);
    const index = await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'Invitation_eventId_id_idx'", [schema]);
    assert.match(index.rows[0].indexdef, /\("eventId", id\)/);
    assert.deepEqual((await db.query('SELECT id, "timeZone", "eventDate"::text AS date FROM "Event"')).rows, [{ id: "old", timeZone: "Asia/Jakarta", date: "2026-11-11 17:05:00" }]);
    assert.deepEqual((await db.query('SELECT id, count, "createdAt"::text AS date FROM "CheckinLog"')).rows, [{ id: "arrival", count: 3, date: "2026-11-11 17:05:00" }]);
    await db.query(`INSERT INTO "Event" (id) VALUES ('new')`);
    assert.equal((await db.query(`SELECT "timeZone" FROM "Event" WHERE id = 'new'`)).rows[0].timeZone, "Asia/Jakarta");
    console.log("Attendance migration: existing dates/counts preserved, timezone backfill/default verified under non-UTC session; isolated schema rolled back.");
  } finally { await db.query("ROLLBACK"); await db.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
