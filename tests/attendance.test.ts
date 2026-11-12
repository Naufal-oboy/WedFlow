import assert from "node:assert/strict";
import { test } from "node:test";
import { attendanceMetrics, timelineInterval, fillTimeline, attendanceTime } from "../src/features/attendance/model";
import { csvCell, csvRow, attendanceFilename, attendanceStatus } from "../src/features/attendance/csv";
import { attendancePolling } from "../src/features/attendance/polling";
import { eventSchema } from "../src/features/management/validation";

test("attendance separates records, quota, people and partial family arrivals", () => {
  const result = attendanceMetrics(3, 8, 3, 2, new Date("2026-11-11T17:05:00Z"));
  assert.deepEqual(result, { invitations: 3, capacity: 8, attendees: 3, arrivedInvitations: 2, remaining: 5, percentage: 37.5, latestCheckinAt: "2026-11-11T17:05:00.000Z" });
  assert.equal(attendanceStatus(2, 4), "Hadir sebagian");
  assert.equal(attendanceStatus(4, 4), "Hadir penuh");
  assert.equal(attendanceStatus(0, 4), "Belum hadir");
  assert.equal(attendanceMetrics(0, 0, 0, 0, null).percentage, 0);
});

test("timeline fills real zero buckets across midnight and bounds long ranges", () => {
  const first = new Date("2026-11-11T16:45:00Z"), last = new Date("2026-11-11T17:15:00Z");
  assert.equal(timelineInterval(first, last), 15);
  assert.deepEqual(fillTimeline([{ start: first, count: 2 }, { start: last, count: 3 }], 15).map(row => row.count), [2, 0, 3]);
  assert.match(attendanceTime(first.toISOString(), "Asia/Jakarta"), /11 Nov/);
  assert.match(attendanceTime(last.toISOString(), "Asia/Jakarta"), /12 Nov/);
  const yearLater = new Date("2027-11-11T17:15:00Z");
  assert.ok(fillTimeline([{ start: first, count: 1 }, { start: yearLater, count: 1 }], timelineInterval(first, yearLater)).length <= 97);
  assert.deepEqual(fillTimeline([], 15), []);
});

test("DST repeated hours remain distinct instants and include offset in display", () => {
  const a = attendanceTime("2026-11-01T05:15:00Z", "America/New_York");
  const b = attendanceTime("2026-11-01T06:15:00Z", "America/New_York");
  assert.notEqual(a, b);
  assert.match(a, /GMT-4/); assert.match(b, /GMT-5/);
});

test("event reporting timezone defaults compatibly and rejects invalid zones", () => {
  const base = { clientId: "00000000-0000-4000-8000-000000000001", name: "Wedding", slug: "wedding", date: "2026-11-11", time: "09:00", location: "Jakarta", status: "ACTIVE" };
  assert.equal(eventSchema.parse(base).timeZone, "Asia/Jakarta");
  assert.equal(eventSchema.safeParse({ ...base, timeZone: "invented/zone" }).success, false);
  assert.equal(eventSchema.parse({ ...base, timeZone: "Asia/Makassar" }).timeZone, "Asia/Makassar");
});

test("CSV handles UTF-8, quotes, commas, line breaks and spreadsheet injection", () => {
  assert.equal(csvCell('Élodie, "Ayu"\nFamily'), '"Élodie, ""Ayu""\nFamily"');
  for (const input of ["=SUM(A1)", "+cmd", "-2+3", "@SUM(A1)", "  =1", "\t=1", "\r=1", "\n=1", "\u0000=1"]) assert.ok(csvCell(input).startsWith('"\''), input);
  assert.equal(csvRow([null, 2]), '"","2"\r\n');
  assert.equal(attendanceFilename('event/"bad', new Date("2026-11-11T00:00:00Z")), "wedflow-attendance-event--bad-20261111T000000Z.csv");
});

test("polling prevents overlapping requests and aborts/ignores pending work on cleanup", async () => {
  let resolve!: (value: number) => void;
  let signal!: AbortSignal;
  let calls = 0, delivered = 0;
  const poll = attendancePolling({ visible: true, load: (value) => { calls++; signal = value; return new Promise<number>(done => { resolve = done; }); }, success: () => delivered++, failure: () => delivered++, busy: () => {} });
  const active = poll.refresh();
  await poll.refresh(); assert.equal(calls, 1);
  poll.stop(); assert.equal(signal.aborted, true);
  resolve(1); await active;
  assert.equal(delivered, 0);
  await poll.refresh(); assert.equal(calls, 1);
});

test("polling pauses when hidden, retains successful data on failure and recovers", async () => {
  let calls = 0, value = 0, failures = 0;
  const poll = attendancePolling({ visible: false, load: async () => { calls++; if (calls === 2) throw new Error("offline"); return calls; }, success: data => { value = data; }, failure: () => failures++, busy: () => {} });
  await poll.refresh(); assert.equal(calls, 0);
  poll.visibility(true); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(value, 1);
  await poll.refresh(); assert.equal(value, 1); assert.equal(failures, 1);
  await poll.refresh(); assert.equal(value, 3);
  poll.visibility(false); await poll.refresh(); assert.equal(calls, 3);
  poll.stop();
});

test("automatic polling schedules a fresh request after completion and removes timers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const poll = attendancePolling({ visible: true, load: async () => ++calls, success: () => {}, failure: () => {}, busy: () => {} });
  await poll.refresh(); assert.equal(calls, 1);
  t.mock.timers.tick(15_000); await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 2);
  poll.visibility(false); t.mock.timers.tick(60_000); assert.equal(calls, 2);
  poll.stop(); t.mock.timers.tick(60_000); assert.equal(calls, 2);
});
