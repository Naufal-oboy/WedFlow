import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/features/auth/password";
import { generateInvitationCode } from "../src/features/invitations/qr";
import { hashTicket, newTicket, publicReceiptMessage } from "../src/features/precheckins/ticket";
import { consumeLimit } from "../src/features/precheckins/rate-limit";
import { testPrecheckinBrowser } from "./test-precheckins-browser";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const base = process.env.AUTH_TEST_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use a local test server.");
const prefix = `precheckin-test-${randomUUID()}`;
const password = randomBytes(24).toString("base64url");
const clientId = randomUUID(), eventIds = [randomUUID(), randomUUID()];
const users = Array.from({ length: 5 }, () => randomUUID());
const invitations = Array.from({ length: 6 }, (_, index) => ({ id: randomUUID(), eventId: eventIds[index === 4 ? 1 : 0], guestName: index < 2 ? "Budi Santoso" : `Family ${index}`, guestQuota: index === 3 ? 1 : 4, code: generateInvitationCode() }));
let assertions = 0;
function check(value: unknown, message: string): asserts value { assert.ok(value, message); assertions++; }
class Session {
  cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    const response = await fetch(new URL(path, base), { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], split = pair.indexOf("="); this.cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
    return response;
  }
  json(path: string, body: unknown, origin = base) { return this.request(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }); }
  async login(index: number) {
    const { csrfToken } = await (await this.request("/api/auth/csrf")).json();
    await this.request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Origin: base }, body: new URLSearchParams({ csrfToken, email: `${prefix}-${index}@example.invalid`, password }) });
    check((await (await this.request("/api/auth/session")).json()).user?.id === users[index], "Login works");
  }
}
const [admin, staff, staff2, outsider, client, anon] = Array.from({ length: 6 }, () => new Session());
const endpoint = `/api/public/events/${prefix}-0/precheckin`;
type Receipt = { token: string; queueCode: string; expiresAt: string; status: string; message: string };
async function submit(name = "Budi Santoso"): Promise<Receipt> {
  const response = await anon.json(endpoint, { name });
  check(response.status === 201, "Public submission succeeds without login");
  check(response.headers.get("cache-control")?.includes("no-store"), "Public receipt is no-store");
  const result = await response.json();
  check(result.message === publicReceiptMessage && result.status === "PENDING", "Generic receipt regardless of name existence");
  check(Object.keys(result).sort().join(",") === "expiresAt,message,queueCode,status,token", "No names, guest lists or attendance in public response");
  return result;
}
async function open(receipt: Receipt, session = staff, eventId = eventIds[0]) {
  const response = await session.json("/api/precheckins/open", { eventId, lookup: receipt.queueCode });
  check(response.status === 200, "Assigned operator can open ticket");
  return response.json();
}
async function verify(requestId: string, index = 0, session = staff) {
  const response = await session.json("/api/precheckins/verify", { eventId: eventIds[0], requestId, invitationId: invitations[index].id });
  check(response.status === 200, "Ticket candidate verification succeeds");
  const result = await response.json();
  return { eventId: eventIds[0], verificationToken: result.verificationToken, count: 1, confirmed: true };
}
async function main() {
  check((await fetch(`${base}/api/health`)).ok, "Test server healthy");
  await prisma.client.create({ data: { id: clientId, name: prefix } });
  await prisma.event.createMany({ data: eventIds.map((id, i) => ({ id, clientId, name: `${prefix}-${i}`, slug: `${prefix}-${i}`, status: "ACTIVE", eventDate: new Date() })) });
  const passwordHash = await hashPassword(password);
  await prisma.user.createMany({ data: users.map((id, i) => ({ id, name: `Precheckin operator ${i}`, email: `${prefix}-${i}@example.invalid`, passwordHash, role: i === 0 ? "SUPER_ADMIN" : i === 4 ? "CLIENT" : "STAFF", clientId: i === 4 ? clientId : null })) });
  await prisma.eventStaff.createMany({ data: [users[1], users[2]].map(userId => ({ userId, eventId: eventIds[0] })) });
  await prisma.invitation.createMany({ data: invitations });
  for (const [i, session] of [admin, staff, staff2, outsider, client].entries()) await session.login(i);
  const page = await anon.request(`/e/${prefix}-0/checkin`);
  const html = await page.text();
  check(page.status === 200 && html.includes("Nama pada undangan"), "Public page requires no login");
  check(!html.includes(invitations[0].guestName) && !html.includes(invitations[0].code), "Public page contains no guest data");
  check((await anon.request(endpoint)).status === 405, "No public search/list GET endpoint");
  for (const value of ["DRAFT", "INACTIVE", "CANCELLED", "COMPLETED"]) {
    await prisma.event.update({ where: { id: eventIds[0] }, data: { status: value } });
    check((await anon.json(endpoint, { name: "Budi" })).status === 404, `Reject ${value} event`);
  }
  await prisma.event.update({ where: { id: eventIds[0] }, data: { status: "ACTIVE" } });
  await prisma.client.update({ where: { id: clientId }, data: { status: "INACTIVE" } });
  check((await anon.json(endpoint, { name: "Budi" })).status === 404, "Inactive client rejected");
  await prisma.client.update({ where: { id: clientId }, data: { status: "ACTIVE" } });
  check((await anon.json(endpoint, { name: "Budi" }, "https://evil.example")).status === 403, "Foreign origin rejected");
  check((await anon.request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Budi" }) })).status === 403, "Missing origin rejected");
  for (const name of ["a", "a".repeat(101), "A\nB"]) check((await anon.json(endpoint, { name })).status === 400, "Input bounds enforced");
  check((await anon.json(endpoint, { name: "a".repeat(3000) })).status === 413, "Actual request body bounded");
  const known = await submit(), unknown = await submit("Unknown individual 93847");
  check(known.token !== unknown.token && known.queueCode !== unknown.queueCode, "Tokens and queue codes independent and unique");
  const stored = await prisma.precheckinRequest.findUniqueOrThrow({ where: { tokenHash: hashTicket(known.token) } });
  check(stored.submittedName === "Budi Santoso" && !JSON.stringify(stored).includes(known.token), "Only token hash persisted");
  const clock = await prisma.$queryRaw<{ usable: boolean; timezone: string }[]>`SELECT ("expiresAt" > CURRENT_TIMESTAMP) AS usable, current_setting('TimeZone') AS timezone FROM "PrecheckinRequest" WHERE "id" = ${stored.id}`;
  check(clock[0].usable && clock[0].timezone === "UTC", "New ticket valid with UTC session even when database defaults to a different timezone");
  for (const [session, status] of [[anon, 401], [client, 403], [outsider, 404]] as const) {
    check((await session.request(`/api/precheckins?eventId=${eventIds[0]}`)).status === status, "Queue role/assignment protected");
    check((await session.json("/api/precheckins/open", { eventId: eventIds[0], lookup: known.token })).status === status, "Token lookup role/assignment protected");
    check((await session.json("/api/precheckins/verify", { eventId: eventIds[0], requestId: stored.id, invitationId: invitations[0].id })).status === status, "Verification role/assignment protected");
    check((await session.json("/api/precheckins/cancel", { eventId: eventIds[0], requestId: stored.id })).status === status, "Cancellation role/assignment protected");
  }
  check((await staff.json("/api/precheckins/open", { eventId: eventIds[1], lookup: known.queueCode })).status === 404, "Cross-event queue denied");
  check((await admin.json("/api/precheckins/open", { eventId: eventIds[1], lookup: known.token })).status === 404, "Token must match selected event even for admin");
  const opened = await open(known);
  check(opened.candidates.length === 2 && opened.candidates[0].id !== opened.candidates[1].id, `Duplicate names remain ambiguous independent invitations: ${JSON.stringify(opened)}`);
  check(!JSON.stringify(opened).includes(invitations[0].code) && !JSON.stringify(opened).includes("tokenHash"), "Internal candidates omit private codes and ticket hashes");
  check((await open(unknown)).candidates.length === 0, "Unknown name produces ticket, matching only internal");
  check((await staff.json("/api/precheckins/open", { eventId: eventIds[0], lookup: known.token })).status === 200, "Secret token fallback works");
  check((await staff.json("/api/precheckins/verify", { eventId: eventIds[0], requestId: stored.id, invitationId: invitations[4].id })).status === 404, "Foreign invitation rejected");
  const payload = { ...await verify(stored.id), count: 2 };
  check(await prisma.checkinLog.count({ where: { eventId: eventIds[0] } }) === 0, "Selecting candidate does not record attendance");
  check((await staff.json("/api/checkins", { ...payload, confirmed: false })).status === 400, "Explicit manual confirmation required");
  check((await staff.json("/api/checkins", { eventId: eventIds[0], verificationToken: known.token, count: 1, confirmed: true })).status === 409, "Public token cannot directly check in");
  check((await staff.json("/api/checkins", { ...payload, count: 5 })).status === 409, "Quota enforced");
  check((await prisma.precheckinRequest.findUniqueOrThrow({ where: { id: stored.id } })).status === "PENDING", "Failed check-in leaves ticket pending");
  const arrivals = await Promise.all([staff.json("/api/checkins", payload), staff.json("/api/checkins", payload)]);
  check(arrivals.map(r => r.status).sort().join(",") === "200,201", "Concurrent retry records once");
  const saved = await prisma.precheckinRequest.findUniqueOrThrow({ where: { id: stored.id }, include: { checkinLog: true } });
  check(saved.status === "VERIFIED" && saved.processedById === users[1] && saved.invitationId === invitations[0].id, "Ticket records operator and selected invitation");
  check(saved.checkinLog?.count === 2 && saved.checkinLog.method === "PUBLIC_PRECHECKIN", "Uses existing CheckinLog with provenance");
  const arrived = await prisma.invitation.findUniqueOrThrow({ where: { id: invitations[0].id } });
  check(Math.abs(arrived.checkedInAt!.getTime() - saved.checkinLog!.createdAt.getTime()) < 60_000, "First arrival and log timestamps use the same UTC instant");
  check((await staff.json("/api/precheckins/verify", { eventId: eventIds[0], requestId: stored.id, invitationId: invitations[0].id })).status === 409, "Verified ticket cannot get fresh verification");
  check((await staff.json("/api/checkins", { ...payload, count: 1 })).status === 409, "Replay cannot change arrival count");
  const next = await open(await submit());
  check((await staff.json("/api/checkins", { ...await verify(next.ticket.id), count: 2 })).status === 201, "New request can record later family arrival");
  check((await prisma.invitation.findUniqueOrThrow({ where: { id: invitations[0].id } })).checkedInCount === 4, "Staged attendance reaches exact quota");
  const full = await open(await submit());
  check((await staff.json("/api/checkins", await verify(full.ticket.id))).status === 409, "Full quota rejects new ticket");
  const race = await open(await submit());
  const a = await verify(race.ticket.id, 1), b = await verify(race.ticket.id, 2, staff2);
  const results = await Promise.all([staff.json("/api/checkins", a), staff2.json("/api/checkins", b)]);
  check(results.map(r => r.status).sort().join(",") === "201,409", "Two operators selecting different invitations consume one ticket once");
  check(await prisma.checkinLog.count({ where: { invitationId: { in: [invitations[1].id, invitations[2].id] } } }) === 1, "Losing transaction creates no false attendance");
  const expiry = await open(await submit());
  const expiryPayload = await verify(expiry.ticket.id, 2);
  await prisma.precheckinRequest.update({ where: { id: expiry.ticket.id }, data: { createdAt: new Date(Date.now() - 3600_000), expiresAt: new Date(Date.now() - 1000) } });
  check((await staff.json("/api/checkins", expiryPayload)).status === 409, "Expiry after verification rejected at commit");
  check((await open({ ...known, queueCode: expiry.ticket.queueCode })).ticket.status === "EXPIRED", "Expiry persisted on read");
  check((await staff.json("/api/precheckins/verify", { eventId: eventIds[0], requestId: expiry.ticket.id, invitationId: invitations[2].id })).status === 409, "Expired ticket cannot verify");
  const cancel = await open(await submit());
  const cancelPayload = await verify(cancel.ticket.id, 2);
  check((await staff.json("/api/precheckins/cancel", { eventId: eventIds[0], requestId: cancel.ticket.id })).status === 200, "Ticket can be cancelled");
  check((await staff.json("/api/checkins", cancelPayload)).status === 409, "Cancelled ticket cannot record arrival");
  const cancelRace = await open(await submit());
  const cancelRacePayload = await verify(cancelRace.ticket.id, 2);
  const cancelResults = await Promise.all([staff.json("/api/checkins", cancelRacePayload), staff2.json("/api/precheckins/cancel", { eventId: eventIds[0], requestId: cancelRace.ticket.id })]);
  check(cancelResults.filter(r => r.ok).length === 1, "Cancellation and arrival cannot both succeed");
  const quotaA = await open(await submit()), quotaB = await open(await submit());
  const quotaPayloadA = await verify(quotaA.ticket.id, 3), quotaPayloadB = await verify(quotaB.ticket.id, 3, staff2);
  const quotaRace = await Promise.all([staff.json("/api/checkins", quotaPayloadA), staff2.json("/api/checkins", quotaPayloadB)]);
  check(quotaRace.map(r => r.status).sort().join(",") === "201,409", "Two different tickets cannot exceed the same invitation quota");
  check((await prisma.invitation.findUniqueOrThrow({ where: { id: invitations[3].id } })).checkedInCount === 1, "Exactly one final place recorded");
  check(await prisma.precheckinRequest.count({ where: { id: { in: [quotaA.ticket.id, quotaB.ticket.id] }, status: "PENDING" } }) === 1, "Quota-race loser remains pending");
  await prisma.precheckinRequest.createMany({ data: Array.from({ length: 21 }, () => {
    const ticket = newTicket();
    return { eventId: eventIds[0], submittedName: "Queue fixture", queueCode: ticket.queueCode, tokenHash: ticket.tokenHash, expiresAt: new Date(Date.now() + 1200_000) };
  }) });
  const queue = await staff.request(`/api/precheckins?eventId=${eventIds[0]}`);
  check(queue.headers.get("cache-control")?.includes("no-store"), "Internal queue is no-store");
  const firstPage = await queue.json();
  check(firstPage.requests.length === 20 && firstPage.nextCursor, "Queue page bounded to 20");
  const secondPage = await (await staff.request(`/api/precheckins?eventId=${eventIds[0]}&cursor=${firstPage.nextCursor}`)).json();
  check(secondPage.requests.length > 0 && secondPage.requests.every((row: { id: string }) => !firstPage.requests.some((first: { id: string }) => first.id === row.id)), "Cursor pagination has no overlaps");
  const pngResponse = await admin.request(`/api/admin/events/${eventIds[0]}/public-qr?download=1`);
  check(pngResponse.status === 200 && pngResponse.headers.get("content-type") === "image/png", "Admin can download public QR");
  const png = PNG.sync.read(Buffer.from(await pngResponse.arrayBuffer()));
  check(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data === `${base}/e/${prefix}-0/checkin`, "QR decodes to correct configured-origin event URL");
  const print = await admin.request(`/api/admin/events/${eventIds[0]}/public-qr`);
  check(print.status === 200 && (await print.text()).includes("Cetak QR umum") && print.headers.has("content-security-policy"), "Printable poster has CSP and QR");
  check((await staff.request(`/api/admin/events/${eventIds[0]}/public-qr`)).status === 403, "Staff cannot export QR poster");
  await testPrecheckinBrowser({ base, slug: `${prefix}-0`, eventId: eventIds[0], cookies: staff.cookies, adminCookies: admin.cookies });
  check(await prisma.checkinLog.count({ where: { invitationId: invitations[5].id } }) === 1, "Lost-response browser retry writes exactly one log");
  const rateKey = `test:${prefix}`;
  const limitResults = await Promise.allSettled(Array.from({ length: 8 }, () => consumeLimit(rateKey, 3)));
  check(limitResults.filter(r => r.status === "fulfilled").length === 3, "Shared limiter caps concurrent requests atomically");
  await prisma.precheckinRateLimit.update({ where: { key: rateKey }, data: { expiresAt: new Date(0) } });
  await consumeLimit(rateKey, 3);
  check((await prisma.precheckinRateLimit.findUniqueOrThrow({ where: { key: rateKey } })).count === 1, "Limiter window expires correctly");
  await prisma.precheckinRateLimit.upsert({ where: { key: `event:${eventIds[0]}` }, create: { key: `event:${eventIds[0]}`, count: 600, expiresAt: new Date(Date.now() + 600_000) }, update: { count: 600, expiresAt: new Date(Date.now() + 600_000) } });
  check((await anon.json(endpoint, { name: "Budi" })).status === 429, "HTTP public limiter enforced");
  console.log(`Public pre-check-in: ${assertions} integration assertions passed, plus mobile browser checks.`);
}
main().finally(async () => {
  await prisma.precheckinRequest.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.checkinLog.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.invitation.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.eventStaff.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.client.deleteMany({ where: { id: clientId } });
  await prisma.precheckinRateLimit.deleteMany({ where: { key: { in: [`test:${prefix}`, ...eventIds.map(id => `event:${id}`)] } } });
  await prisma.$disconnect();
}).catch(error => { console.error(error); process.exitCode = 1; });
