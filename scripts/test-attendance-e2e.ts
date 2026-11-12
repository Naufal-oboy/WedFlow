import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, expect } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/features/auth/password";
import { newTicket } from "../src/features/precheckins/ticket";
import type { AttendanceSnapshot } from "../src/features/attendance/model";
import { attendanceExport } from "../src/features/attendance/export";
import { csvCell } from "../src/features/attendance/csv";

const base = process.env.AUTH_TEST_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use a local test server.");
const prefix = `attendance-test-${randomUUID()}`;
const password = randomBytes(24).toString("base64url");
const clients = [randomUUID(), randomUUID()];
const events = [randomUUID(), randomUUID(), randomUUID()];
const users = Array.from({ length: 5 }, () => randomUUID());
const invitationId = randomUUID(), code = randomBytes(32).toString("base64url");
const endpoint = `/api/events/${events[0]}/attendance`;
let assertions = 0;
function check(value: unknown, message: string): asserts value { assert.ok(value, message); assertions++; }
class Session {
  cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    const response = await fetch(new URL(path, base), { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(65_000) });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], split = pair.indexOf("="); this.cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
    return response;
  }
  post(path: string, body: unknown) { return this.request(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) }); }
  async login(index: number) {
    const { csrfToken } = await (await this.request("/api/auth/csrf")).json();
    await this.request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Origin: base }, body: new URLSearchParams({ csrfToken, email: `${prefix}-${index}@example.invalid`, password }) });
    check((await (await this.request("/api/auth/session")).json()).user?.id === users[index], "Login succeeds");
  }
}
const [admin, owner, staff, foreignClient, outsider, anon] = Array.from({ length: 6 }, () => new Session());
async function snapshot(session = owner): Promise<AttendanceSnapshot> {
  const response = await session.request(endpoint);
  check(response.status === 200 && response.headers.get("cache-control")?.includes("no-store"), "Authorized private snapshot");
  return response.json();
}

async function browserChecks() {
  const browser = await chromium.launch({ channel: process.env.QR_BROWSER_CHANNEL || "msedge", headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([...owner.cookies].map(([name, value]) => ({ name, value, url: base, httpOnly: true, sameSite: "Lax" as const })));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let failure = false, denied = false, requests = 0;
    await page.route(`**${endpoint}`, async route => {
      requests++;
      if (denied || failure) await route.fulfill({ status: denied ? 401 : 503, json: { error: "Test failure" } });
      else await route.continue();
    });
    await page.clock.install();
    await page.goto(`${base}/client/events/${events[0]}`);
    const panel = page.getByRole("region", { name: "Laporan kehadiran", exact: true });
    await expect(panel.getByText("24 orang", { exact: true })).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}px`);
      await expect(panel.getByRole("button", { name: "Unduh CSV", exact: true })).toBeVisible();
      await page.screenshot({ path: join(tmpdir(), `wedflow-attendance-${width}.png`), fullPage: true });
    }
    const before = requests;
    await page.clock.fastForward(15_001);
    await expect.poll(() => requests).toBeGreaterThan(before);
    await expect(panel.getByRole("button", { name: "Perbarui", exact: true })).toBeEnabled();
    failure = true;
    await panel.getByRole("button", { name: "Perbarui", exact: true }).click();
    await expect(panel.getByText("Data mungkin kedaluwarsa.", { exact: false })).toBeVisible();
    await expect(panel.getByText("24 orang", { exact: true })).toBeVisible();
    failure = false;
    await panel.getByRole("button", { name: "Perbarui", exact: true }).click();
    await expect(panel.getByText("Data mungkin kedaluwarsa.", { exact: false })).toHaveCount(0);
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
    const hiddenRequests = requests;
    await page.clock.fastForward(60_000);
    check(requests === hiddenRequests, "No polling while hidden");
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
    await expect.poll(() => requests).toBeGreaterThan(hiddenRequests);
    await expect(panel.getByRole("button", { name: "Perbarui", exact: true })).toBeEnabled();
    denied = true;
    await panel.getByRole("button", { name: "Perbarui", exact: true }).click();
    await expect(panel.getByText("24 orang", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Perbarui", exact: true })).toBeDisabled();
    check(errors.length === 0, `No browser exceptions: ${errors.join(", ")}`);
    await context.close();
  } finally { await browser.close(); }
}

async function main() {
  check((await fetch(`${base}/api/health`)).ok, "Server healthy");
  await prisma.client.createMany({ data: clients.map(id => ({ id, name: prefix })) });
  await prisma.event.createMany({ data: events.map((id, i) => ({ id, clientId: clients[i === 1 ? 1 : 0], name: i === 0 ? '=Wedding, "Élodie"' : prefix, slug: `${prefix}-${i}`, status: "ACTIVE", timeZone: "Asia/Jakarta", eventDate: new Date() })) });
  const passwordHash = await hashPassword(password);
  await prisma.user.createMany({ data: users.map((id, i) => ({ id, name: `Attendance operator ${i}`, email: `${prefix}-${i}@example.invalid`, passwordHash, role: i === 0 ? "SUPER_ADMIN" : i === 1 || i === 3 ? "CLIENT" : "STAFF", clientId: i === 1 ? clients[0] : i === 3 ? clients[1] : null })) });
  await prisma.eventStaff.create({ data: { eventId: events[0], userId: users[2] } });
  await prisma.invitation.create({ data: { id: invitationId, eventId: events[0], guestName: 'Élodie, "Family"', guestQuota: 4, code } });
  for (const [i, session] of [admin, owner, staff, foreignClient, outsider].entries()) await session.login(i);
  for (const [session, expected] of [[anon, 401], [foreignClient, 404], [outsider, 404]] as const) {
    check((await session.request(endpoint)).status === expected, "Snapshot role/ownership enforced");
    check((await session.request(`${endpoint}/export`)).status === (session === outsider ? 403 : expected), "Export ownership enforced");
  }
  check((await staff.request(`${endpoint}/export`)).status === 403, "Assigned staff cannot export");
  check((await staff.request(`/api/events/${events[1]}/attendance`)).status === 404, "Assigned staff cannot access other events");
  check((await admin.request(`/api/events/${events[1]}/attendance`)).status === 200, "Admin has system-wide access");
  check((await owner.request(`/api/events/not-a-uuid/attendance`)).status === 400, "Malformed event rejected");
  const empty = await (await owner.request(`/api/events/${events[2]}/attendance`)).json();
  check(empty.summary.capacity === 0 && empty.summary.percentage === 0 && empty.timeline.buckets.length === 0, "Zero capacity and empty timeline safe");
  const ticket = newTicket();
  await prisma.precheckinRequest.create({ data: { eventId: events[0], submittedName: "Pending family", queueCode: ticket.queueCode, tokenHash: ticket.tokenHash, expiresAt: new Date(Date.now() + 1200_000) } });
  check((await snapshot()).summary.attendees === 0, "Pending public ticket is not attendance");
  const verify = await staff.post("/api/checkins/verify", { eventId: events[0], method: "MANUAL", code });
  check(verify.ok, "Existing check-in verification succeeds");
  const payload = { eventId: events[0], verificationToken: (await verify.json()).verificationToken, count: 2, confirmed: true };
  check((await staff.post("/api/checkins", { ...payload, confirmed: false })).status === 400, "Unconfirmed operation rejected");
  check((await snapshot()).summary.attendees === 0, "Invalid operation has no attendance");
  const race = await Promise.all([staff.post("/api/checkins", payload), staff.post("/api/checkins", payload)]);
  check(race.map(row => row.status).sort().join(",") === "200,201", "Concurrent duplicate writes once");
  let data = await snapshot();
  check(data.summary.attendees === 2 && data.summary.capacity === 4 && data.summary.percentage === 50 && data.summary.arrivedInvitations === 1 && data.summary.remaining === 2, "Partial family metrics exact");
  check(data.activity[0].staffName === null, "Client response omits staff identity");
  check((await snapshot(staff)).activity[0].staffName === "Attendance operator 2", "Assigned staff sees recorded operator");
  check(!JSON.stringify(data).includes(code) && !JSON.stringify(data).includes(ticket.tokenHash), "Snapshot has no invitation/ticket secrets");
  const verify2 = await staff.post("/api/checkins/verify", { eventId: events[0], method: "MANUAL", code });
  check((await staff.post("/api/checkins", { ...payload, verificationToken: (await verify2.json()).verificationToken, count: 1 })).status === 201, "Later partial arrival succeeds");
  const logs = await prisma.checkinLog.findMany({ where: { eventId: events[0] }, orderBy: { createdAt: "asc" } });
  await prisma.checkinLog.update({ where: { id: logs[0].id }, data: { createdAt: new Date("2026-11-11T16:55:00Z") } });
  await prisma.checkinLog.update({ where: { id: logs[1].id }, data: { createdAt: new Date("2026-11-11T17:05:00Z") } });
  data = await snapshot();
  check(data.timeline.buckets.length === 2 && data.timeline.buckets.reduce((sum, row) => sum + row.count, 0) === 3, "Timeline spans local midnight without losing people");
  check(data.summary.latestCheckinAt === "2026-11-11T17:05:00.000Z", "Latest arrival uses log rather than first invitation timestamp");
  const other = await prisma.invitation.create({ data: { eventId: events[1], guestName: "Foreign private guest", code: randomUUID(), guestQuota: 100, checkedInCount: 100, checkedInAt: new Date() } });
  await prisma.checkinLog.create({ data: { eventId: events[1], invitationId: other.id, count: 100, method: "QR" } });
  check((await snapshot()).summary.attendees === 3, "Foreign attendance does not affect totals");
  const bulk = Array.from({ length: 501 }, (_, i) => ({ id: randomUUID(), eventId: events[0], guestName: i === 0 ? "=Unsafe guest" : `Batch guest ${i}`, guestQuota: i === 0 ? 30 : 1, code: randomUUID() }));
  await prisma.invitation.createMany({ data: bulk });
  const sameTime = new Date("2026-11-11T17:10:00Z");
  const moreLogs = Array.from({ length: 21 }, () => ({ id: randomUUID(), eventId: events[0], invitationId: bulk[0].id, count: 1, method: "QR" as const, createdAt: sameTime }));
  await prisma.checkinLog.createMany({ data: moreLogs });
  await prisma.invitation.update({ where: { id: bulk[0].id }, data: { checkedInAt: sameTime, checkedInCount: 21 } });
  data = await snapshot();
  check(data.activity.length === 20 && data.summary.attendees === 24, "Recent activity bounded; all arrivals still counted");
  check(data.activity.map(row => row.id).join() === moreLogs.map(row => row.id).sort().reverse().slice(0, 20).join(), "Timestamp ties use deterministic id ordering");
  const report = await owner.request(`${endpoint}/export`);
  check(report.ok && report.headers.get("content-type") === "text/csv; charset=utf-8", "UTF-8 CSV available to owner");
  check(report.headers.get("content-disposition")?.includes("wedflow-attendance-"), "Filename follows convention");
  const bytes = new Uint8Array(await report.arrayBuffer());
  check(bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191, "UTF-8 BOM present");
  const csv = new TextDecoder().decode(bytes);
  check(csv.split("\r\n").length === 504, "CSV includes every invitation over multiple 500-row batches");
  check(csv.includes('"\'=Wedding, ""Élodie"""') && csv.includes('"\'=Unsafe guest"') && csv.includes('"Élodie, ""Family"""'), "Export quotes and formula defenses applied to event and guest names");
  check(!csv.includes(code) && !csv.includes(invitationId) && !csv.includes("Foreign private guest"), "CSV excludes secrets, internal IDs, and other-event guests");
  check(csv.includes('"4","3","Hadir sebagian"'), "CSV counts confirmed partial attendance");
  // Consume the actual stream slowly so a concurrent edit falls between batches.
  const directReport = await attendanceExport({ id: users[1], name: "Owner", email: `${prefix}-1@example.invalid`, role: "CLIENT", clientId: clients[0] }, events[0], new AbortController().signal);
  const reader = directReport.body!.getReader();
  await reader.read();
  const tail = [...bulk].sort((a, b) => a.id.localeCompare(b.id)).at(-1)!;
  await prisma.invitation.update({ where: { id: tail.id }, data: { guestQuota: tail.guestQuota + 10 } });
  let consistentCsv = "";
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; consistentCsv += new TextDecoder().decode(chunk.value); }
  check(consistentCsv.includes(`${csvCell(tail.guestName)},"${tail.guestQuota}",`), "Export snapshot remains consistent across concurrent invitation edits");
  await prisma.invitation.update({ where: { id: tail.id }, data: { guestQuota: tail.guestQuota } });
  const aborted = new AbortController();
  const cancelledReport = await attendanceExport({ id: users[0], name: "Admin", email: `${prefix}-0@example.invalid`, role: "SUPER_ADMIN", clientId: null }, events[0], aborted.signal);
  const cancelledReader = cancelledReport.body!.getReader();
  await cancelledReader.read();
  aborted.abort();
  await assert.rejects(cancelledReader.read(), /Ekspor terputus/);
  check(true, "Aborted CSV stream fails instead of pretending completion");
  await browserChecks();
  await prisma.event.update({ where: { id: events[0] }, data: { status: "CANCELLED" } });
  check((await snapshot()).summary.attendees === 24, "Cancelling event preserves historical confirmed attendance");
  await prisma.client.update({ where: { id: clients[0] }, data: { status: "INACTIVE" } });
  check((await owner.request(endpoint)).status === 401 && (await staff.request(endpoint)).status === 404, "Inactive client revokes client and staff access");
  check((await admin.request(endpoint)).status === 200, "Admin retains historical reporting access");
  console.log(`Attendance: ${assertions} HTTP/database/browser assertions passed.`);
}

main().finally(async () => {
  await prisma.precheckinRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.checkinLog.deleteMany({ where: { eventId: { in: events } } });
  await prisma.invitation.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.client.deleteMany({ where: { id: { in: clients } } });
  await prisma.$disconnect();
}).catch(error => { console.error(error); process.exitCode = 1; });
