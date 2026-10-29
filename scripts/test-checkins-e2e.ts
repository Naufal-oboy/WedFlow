import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/features/auth/password";
import { generateInvitationCode } from "../src/features/invitations/qr";
import { testCheckinBrowser } from "./test-checkins-browser";

const base = process.env.AUTH_TEST_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use a local test server.");
const prefix = `checkin-test-${randomUUID()}`;
const password = randomBytes(24).toString("base64url");
const clientId = randomUUID(), eventIds = [randomUUID(), randomUUID()];
const users = Array.from({ length: 5 }, () => randomUUID());
const invitations = Array.from({ length: 7 }, (_, index) => ({ id: randomUUID(), eventId: eventIds[index === 4 ? 1 : 0], guestName: index < 2 ? "Budi Santoso" : ["", "", "Siti Aminah", "Concurrent Family", "Other Event Guest", "Browser Family", "Fresh Family"][index], guestQuota: index === 3 ? 1 : 4, code: generateInvitationCode() }));
let assertions = 0;
function check(value: unknown, message: string): asserts value { assert.ok(value, message); assertions++; }
class Session {
  cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    const result = await fetch(new URL(path, base), { ...init, headers, redirect: "manual" });
    for (const cookie of result.headers.getSetCookie()) { const pair = cookie.split(";")[0], split = pair.indexOf("="); this.cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
    return result;
  }
  json(path: string, data: unknown, origin = base) { return this.request(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(data) }); }
  async login(index: number) {
    const { csrfToken } = await (await this.request("/api/auth/csrf")).json();
    await this.request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Origin: base }, body: new URLSearchParams({ csrfToken, email: `${prefix}-${index}@example.invalid`, password }) });
    check((await (await this.request("/api/auth/session")).json()).user?.id === users[index], "Login succeeds");
  }
}
const [admin, staff, staff2, outsider, client, anon] = Array.from({ length: 6 }, () => new Session());
async function verify(session: Session, index = 0, method = "QR") {
  const invitation = invitations[index];
  const response = await session.json("/api/checkins/verify", { eventId: invitation.eventId, method, ...(method === "NAME_SEARCH" ? { invitationId: invitation.id } : { code: invitation.code }) });
  check(response.status === 200, `Verify ${method} invitation ${index}`);
  const result = await response.json();
  check(result.invitation.id === invitation.id && result.event.id === invitation.eventId, "Verification returns correct scoped detail");
  check(!JSON.stringify(result).includes(invitation.code), "Verification never returns QR code");
  return { eventId: invitation.eventId, verificationToken: result.verificationToken as string, count: 1, confirmed: true };
}
function expired(token: string) {
  const payload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()), expires: 1 })).toString("base64url");
  return `${payload}.${createHmac("sha256", process.env.AUTH_SECRET!).update(`checkin-verification:${payload}`).digest("base64url")}`;
}
async function main() {
  check((await fetch(`${base}/api/health`)).ok, "Server is healthy");
  await prisma.client.create({ data: { id: clientId, name: prefix } });
  await prisma.event.createMany({ data: eventIds.map((id, i) => ({ id, clientId, name: `${prefix}-${i}`, slug: `${prefix}-${i}`, status: "ACTIVE", eventDate: new Date() })) });
  const passwordHash = await hashPassword(password);
  await prisma.user.createMany({ data: users.map((id, i) => ({ id, name: `Test operator ${i}`, email: `${prefix}-${i}@example.invalid`, passwordHash, role: i === 0 ? "SUPER_ADMIN" : i === 4 ? "CLIENT" : "STAFF", clientId: i === 4 ? clientId : null })) });
  await prisma.eventStaff.createMany({ data: [users[1], users[2]].map((userId) => ({ userId, eventId: eventIds[0] })) });
  await prisma.invitation.createMany({ data: invitations });
  for (const [i, session] of [admin, staff, staff2, outsider, client].entries()) await session.login(i);
  if (process.env.CHECKIN_BROWSER_ONLY === "1") {
    await testCheckinBrowser({ base, eventId: eventIds[0], invitation: invitations[5], cookies: staff.cookies });
    return;
  }
  for (const [session, status] of [[anon, 401], [client, 403], [outsider, 404]] as const) {
    for (const suffix of [`search?eventId=${eventIds[0]}&q=Budi`, `detail?eventId=${eventIds[0]}&invitationId=${invitations[0].id}`, `history?eventId=${eventIds[0]}`]) check((await session.request(`/api/checkins/${suffix}`)).status === status, "Read operations enforce role and assignment");
    check((await session.json("/api/checkins/verify", { eventId: eventIds[0], method: "QR", code: invitations[0].code })).status === status, "Verification enforces role and assignment");
  }
  for (const q of ["BUDI", "santo", "Budy Santoso", "Budi Santsoo"]) {
    const response = await staff.request(`/api/checkins/search?eventId=${eventIds[0]}&q=${encodeURIComponent(q)}`);
    check(response.ok, "Search succeeds");
    const result = await response.json();
    check(result.invitations.filter((item: { guestName: string }) => item.guestName === "Budi Santoso").length === 2, "Case, partial and typo searches preserve distinct duplicates");
    check(!JSON.stringify(result).includes(invitations[0].code), "Search excludes codes");
  }
  check((await staff.request(`/api/checkins/search?eventId=${eventIds[1]}&q=Budi`)).status === 404, "Staff cannot search unassigned event");
  for (const q of ["a", "a".repeat(101)]) check((await staff.request(`/api/checkins/search?eventId=${eventIds[0]}&q=${q}`)).status === 400, "Search bounds enforced");
  check((await staff.request(`/api/checkins/detail?eventId=${eventIds[0]}&invitationId=${invitations[4].id}`)).status === 404, "Cross-event invitation detail is rejected");
  for (const code of [invitations[4].code, generateInvitationCode(), "https://example.com", "invalid"]) check((await staff.json("/api/checkins/verify", { eventId: eventIds[0], method: "QR", code })).status >= 400, "Foreign, unknown and malformed QR rejected");
  check((await admin.json("/api/checkins/verify", { eventId: eventIds[1], method: "QR", code: invitations[0].code })).status === 404, "Even admin must select correct event");
  const first = { ...await verify(staff), count: 2 };
  check((await prisma.invitation.findUniqueOrThrow({ where: { id: invitations[0].id } })).checkedInAt === null, "Verification does not check in");
  check((await staff.json("/api/checkins", { eventId: eventIds[0], code: invitations[0].code, count: 1 })).status === 400, "Legacy direct write cannot bypass confirmation");
  for (const patch of [{ confirmed: false }, { confirmed: undefined }, { count: 0 }, { count: -1 }]) check((await staff.json("/api/checkins", { ...first, ...patch })).status === 400, "Explicit confirmation and positive count required");
  check((await staff2.json("/api/checkins", first)).status === 409, "Token cannot transfer between operators");
  check((await client.json("/api/checkins", first)).status === 403, "Client cannot record attendance");
  check((await staff.json("/api/checkins", first, "https://evil.example")).status === 403, "Foreign origin denied");
  check((await staff.json("/api/checkins", { ...first, verificationToken: first.verificationToken + "x" })).status === 409, "Tampered token rejected");
  check((await staff.json("/api/checkins", { ...first, verificationToken: expired(first.verificationToken) })).status === 409, "Unused expired token rejected");
  check((await staff.json("/api/checkins", { ...first, count: 5 })).status === 409, "Over-quota arrival rejected");
  const replies = await Promise.all([staff.json("/api/checkins", first), staff.json("/api/checkins", first)]);
  check(replies.map((item) => item.status).sort().join(",") === "200,201", "Concurrent retries create one arrival");
  const original = await prisma.invitation.findUniqueOrThrow({ where: { id: invitations[0].id } });
  check(original.checkedInCount === 2, "First arrival has two people");
  check((await staff.json("/api/checkins", { ...first, count: 1 })).status === 409, "Replay cannot change count");
  check((await staff.json("/api/checkins", { ...first, verificationToken: expired(first.verificationToken) })).status === 200, "Committed token can be retried after expiry");
  for (const method of ["NAME_SEARCH", "MANUAL"]) {
    const payload = await verify(staff2, 0, method);
    check((await staff2.json("/api/checkins", payload)).status === 201, "Later verified arrival succeeds");
  }
  const final = await prisma.invitation.findUniqueOrThrow({ where: { id: invitations[0].id } });
  check(final.checkedInCount === 4 && final.checkedInAt?.getTime() === original.checkedInAt?.getTime() && final.checkedInById === users[1], "Cumulative count and first-arrival metadata retained");
  check((await staff.json("/api/checkins", await verify(staff))).status === 409, "Full invitation rejects another arrival");
  const history = await (await staff.request(`/api/checkins/history?eventId=${eventIds[0]}&invitationId=${invitations[0].id}`)).json();
  check(history.arrivals.length === 3 && history.arrivals.reduce((sum: number, row: { count: number }) => sum + row.count, 0) === 4, "One log per arrival, exact totals");
  check(new Set(history.arrivals.map((row: { method: string }) => row.method)).size === 3, "All arrival methods audited");
  check(!JSON.stringify(history).includes("@example.invalid"), "History excludes staff email");
  const a = await verify(staff, 3), b = await verify(staff2, 3);
  const concurrent = await Promise.all([staff.json("/api/checkins", a), staff2.json("/api/checkins", b)]);
  check(concurrent.map((item) => item.status).sort().join(",") === "201,409", "Different operators cannot overrun the last place");
  check(await prisma.checkinLog.count({ where: { invitationId: invitations[3].id } }) === 1, "Conflict rolls back its arrival log");
  const stale = await verify(staff, 6);
  await prisma.invitation.update({ where: { id: invitations[6].id }, data: { guestName: "Changed Family" } });
  check((await staff.json("/api/checkins", stale)).status === 409, "Changed invitation must be verified again");
  const revoked = await verify(staff2, 6);
  await prisma.eventStaff.delete({ where: { eventId_userId: { eventId: eventIds[0], userId: users[2] } } });
  check((await staff2.json("/api/checkins", revoked)).status === 404, "Assignment revocation invalidates previously verified access");
  const inactive = await verify(staff, 6);
  await prisma.event.update({ where: { id: eventIds[0] }, data: { status: "COMPLETED" } });
  check((await staff.json("/api/checkins", inactive)).status === 409, "Inactive event rejects writes");
  await prisma.event.update({ where: { id: eventIds[0] }, data: { status: "ACTIVE" } });
  await prisma.client.update({ where: { id: clientId }, data: { status: "INACTIVE" } });
  check((await staff.request(`/api/checkins/search?eventId=${eventIds[0]}&q=Budi`)).status === 404, "Inactive client blocks search");
  await prisma.client.update({ where: { id: clientId }, data: { status: "ACTIVE" } });
  check((await admin.json("/api/checkins", await verify(admin, 2))).status === 201, "Super Admin can record a verified arrival");
  const many = Array.from({ length: 23 }, () => ({ id: randomUUID(), eventId: eventIds[0], guestName: "Bounded Search", guestQuota: 1, code: generateInvitationCode() }));
  await prisma.invitation.createMany({ data: many });
  check((await (await staff.request(`/api/checkins/search?eventId=${eventIds[0]}&q=Bounded`)).json()).invitations.length === 20, "Search limit is enforced");
  const timestamp = new Date();
  await prisma.$transaction([
    prisma.invitation.updateMany({ where: { id: { in: many.map((row) => row.id) } }, data: { checkedInCount: 1, checkedInAt: timestamp, checkedInById: users[0] } }),
    prisma.checkinLog.createMany({ data: many.map((row) => ({ eventId: row.eventId, invitationId: row.id, userId: users[0], count: 1, method: "MANUAL", createdAt: timestamp })) }),
  ]);
  const historyPage = await (await staff.request(`/api/checkins/history?eventId=${eventIds[0]}`)).json();
  check(historyPage.arrivals.length === 20 && historyPage.nextCursor, "History is bounded and supplies cursor");
  const historyNext = await (await staff.request(`/api/checkins/history?eventId=${eventIds[0]}&cursor=${historyPage.nextCursor}`)).json();
  check(historyNext.arrivals.length === 8 && !historyNext.nextCursor, "History cursor handles tied timestamps without missing rows");
  check(!historyNext.arrivals.some((row: { id: string }) => historyPage.arrivals.some((first: { id: string }) => first.id === row.id)), "History pages do not overlap");
  check((await admin.request(`/api/checkins/history?eventId=${eventIds[1]}&cursor=${historyPage.nextCursor}`)).status === 400, "History cursor cannot cross events");
  console.log(`Smart check-in functional HTTP: ${assertions} assertions passed; browser/rate checks next.`);
  if (process.env.CHECKIN_BROWSER_TESTS === "1") await testCheckinBrowser({ base, eventId: eventIds[0], invitation: invitations[5], cookies: staff.cookies });
  // Separate account budget avoids interfering with the functional scenarios.
  let limited = false;
  for (let i = 0; i < 121; i++) {
    const response = await admin.request(`/api/checkins/search?eventId=${eventIds[0]}&q=Budi`);
    if (response.status === 429) { limited = true; break; }
  }
  check(limited, "Rate limit returns HTTP 429");
  console.log(`Smart check-in HTTP: ${assertions} assertions passed.`);
}
main().catch((error) => { console.error("Smart check-in E2E failed:", error instanceof Error && !error.message.includes("prisma") ? error.message : "Database/test setup failure."); process.exitCode = 1; }).finally(async () => {
  try {
    await prisma.checkinLog.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.invitation.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    console.log("Temporary check-in fixtures cleaned up.");
  } finally { await prisma.$disconnect(); }
});
