import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const db = new Client({ connectionString: process.env.DATABASE_URL });
async function main() {
const migration = (await readFile("prisma/migrations/20261029000000_smart_checkin/migration.sql", "utf8")).replace(/^BEGIN;|^COMMIT;/gm, "");
try {
  await db.connect();
  for (const invalid of [false, true]) {
    const schema = `checkin_test_${randomUUID().replaceAll("-", "")}`;
    await db.query("BEGIN");
    try {
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.query(`SET LOCAL search_path TO "${schema}", public`);
      await db.query('CREATE TABLE "Event" (id TEXT PRIMARY KEY); CREATE TABLE "User" (id TEXT PRIMARY KEY); CREATE TABLE "Invitation" (id TEXT PRIMARY KEY, "eventId" TEXT, "guestName" TEXT, "guestQuota" INTEGER, "checkedInCount" INTEGER, "checkedInById" TEXT, "checkedInAt" TIMESTAMP(3));');
      await db.query('INSERT INTO "Event" VALUES ($1)', ["event"]);
      await db.query('INSERT INTO "User" VALUES ($1)', ["staff"]);
      await db.query('INSERT INTO "Invitation" VALUES ($1,$2,$3,$4,$5,$6,$7)', ["legacy", "event", "Legacy family", 4, invalid ? null : 2, "staff", new Date("2026-01-01T00:00:00Z")]);
      if (invalid) await assert.rejects(db.query(migration), /Invitation_attendance_valid/);
      else {
        await db.query(migration);
        const rows = await db.query('SELECT * FROM "CheckinLog"');
        assert.equal(rows.rowCount, 1);
        assert.equal(rows.rows[0].id, "legacy:legacy");
        assert.equal(rows.rows[0].count, 2);
        assert.equal(rows.rows[0].legacy, true);
        assert.equal(rows.rows[0].createdAt.toISOString(), "2026-01-01T00:00:00.000Z");
        assert.equal((await db.query('SELECT "checkedInCount" FROM "Invitation"')).rows[0].checkedInCount, 2);
      }
    } finally { await db.query("ROLLBACK"); }
  }
  console.log("Check-in migration passed: legacy backfill preserves totals/time; inconsistent legacy data fails atomically; isolated schemas rolled back.");
} finally { await db.end(); }
}
main().catch(() => { console.error("Check-in migration test failed."); process.exitCode = 1; });
