import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { compare } from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/features/auth/password";
import { bootstrapSuperAdmin } from "../src/features/auth/bootstrap";

// Uses uniquely identified temporary fixtures; never deletes existing application records.
const base = process.env.AUTH_TEST_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Run auth tests against a local server only.");
const prefix = `auth-test-${randomUUID()}`;
const password = randomBytes(24).toString("base64url");
const ids: Record<"admin" | "clientA" | "clientB" | "staff" | "unlinked", string> = { admin: randomUUID(), clientA: randomUUID(), clientB: randomUUID(), staff: randomUUID(), unlinked: randomUUID() };
const clientIds = [randomUUID(), randomUUID()];
const eventIds = [randomUUID(), randomUUID()];
const invitationIds = [randomUUID(), randomUUID()];
const userIds: string[] = [];
let assertions = 0;
function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
  assertions++;
}

class BrowserSession {
  cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    const response = await fetch(new URL(path, base), { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
  async login(email: string, credential = password, callbackUrl = "/dashboard") {
    const { csrfToken } = await (await this.request("/api/auth/csrf")).json();
    return this.request("/api/auth/callback/credentials", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Origin: base },
      body: new URLSearchParams({ csrfToken, email, password: credential, callbackUrl }),
    });
  }
  async session() { return (await this.request("/api/auth/session")).json(); }
  async json(path: string, method: string, data: unknown, origin = base) {
    return this.request(path, { method, headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(data) });
  }
}

async function main() {
  const health = await fetch(`${base}/api/health`);
  check(health.ok, "Local server and database must be healthy before tests.");
  const adminEmail = `${prefix}-admin@example.invalid`;
  const initial = await bootstrapSuperAdmin({ email: adminEmail, password, name: "Auth Test Admin" });
  if (initial === "created") {
    const created = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail }, select: { id: true } });
    ids.admin = created.id;
    userIds.push(created.id);
  }
  const passwordHash = await hashPassword(password);
  await prisma.client.createMany({ data: clientIds.map((id, index) => ({ id, name: `${prefix}-client-${index}` })) });
  for (const [name, id] of Object.entries(ids)) {
    if (name === "admin" && initial === "created") continue;
    const role = name === "admin" ? "SUPER_ADMIN" : name === "staff" ? "STAFF" : "CLIENT";
    await prisma.user.create({ data: { id, name: `Auth Test ${name}`, email: `${prefix}-${name.toLowerCase()}@example.invalid`, passwordHash, role,
      clientId: name === "clientA" ? clientIds[0] : name === "clientB" ? clientIds[1] : null } });
    userIds.push(id);
  }
  const beforeSeed = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
  for (let i = 0; i < 2; i++) check(await bootstrapSuperAdmin({ email: adminEmail, password: randomBytes(24).toString("base64url") }) === "exists", "Seed must be idempotent.");
  const afterSeed = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
  check(beforeSeed.passwordHash === afterSeed.passwordHash, "Seed must not reset passwords.");
  check(await compare(password, afterSeed.passwordHash), "Seed password must be bcrypt hashed.");
  let conflictRejected = false;
  try { await bootstrapSuperAdmin({ email: `${prefix}-staff@example.invalid`, password }); } catch { conflictRejected = true; }
  check(conflictRejected, "Seed must not promote existing staff.");

  await prisma.event.createMany({ data: eventIds.map((id, index) => ({ id, clientId: clientIds[index], name: `${prefix}-event-${index}`, slug: `${prefix}-${index}`, eventDate: new Date("2030-01-01T08:00:00Z") })) });
  await prisma.eventStaff.create({ data: { eventId: eventIds[0], userId: ids.staff } });
  await prisma.invitation.createMany({ data: invitationIds.map((id, index) => ({ id, eventId: eventIds[index], guestName: "Auth Test Guest", guestQuota: 2, code: `${prefix}-code-${index}` })) });

  const guest = new BrowserSession();
  for (const path of ["/api/events", "/api/admin/users", `/api/checkins?eventId=${eventIds[0]}`]) check((await guest.request(path)).status === 401, "Anonymous API requests must return 401.");
  for (const path of ["/admin", "/client", "/staff"]) {
    const response = await guest.request(path);
    const text = await response.text();
    check(response.headers.get("location")?.includes("/login") || text.includes("/login"), "Anonymous dashboard must redirect to login.");
    check(!text.includes(`${prefix}-event`), "Anonymous dashboard must not leak events.");
  }
  await guest.login(adminEmail, "incorrect-password");
  check(!(await guest.session())?.user, "Wrong password must not create a session.");
  await guest.login(`${prefix}-missing@example.invalid`);
  check(!(await guest.session())?.user, "Unknown email must not create a session.");

  const sessions = new Map<string, BrowserSession>();
  for (const [name, role, home] of [["admin", "SUPER_ADMIN", "/admin"], ["clienta", "CLIENT", "/client"], ["clientb", "CLIENT", "/client"], ["staff", "STAFF", "/staff"], ["unlinked", "CLIENT", "/client"]]) {
    const session = new BrowserSession();
    const login = await session.login(`${prefix}-${name}@example.invalid`.toUpperCase());
    check(login.ok, `Login request must succeed for ${role}.`);
    const info = await session.session();
    check(info?.user?.role === role, `Session role must be ${role}.`);
    check(!JSON.stringify(info).includes("passwordHash"), "Session must not expose hashes.");
    const dashboard = await session.request(home);
    check(dashboard.ok, `Dashboard must be accessible for ${role}.`);
    const html = await dashboard.text();
    check(html.includes("Auth Test"), "Dashboard must show the authenticated name.");
    check(!html.includes("passwordHash"), "Dashboard must not expose hashes.");
    const dispatch = await session.request("/dashboard");
    check(dispatch.headers.get("location")?.includes(home) || (await dispatch.text()).includes(home), "Dispatcher must select role home.");
    sessions.set(name, session);
  }
  const admin = sessions.get("admin")!, clientA = sessions.get("clienta")!, clientB = sessions.get("clientb")!, staff = sessions.get("staff")!, unlinked = sessions.get("unlinked")!;
  for (const browser of [clientA, clientB, staff]) {
    check((await browser.request("/api/admin/users")).status === 403, "Only admins can read accounts.");
    check((await browser.json("/api/admin/users", "POST", {})).status === 403, "Only admins can create accounts.");
    check((await browser.json(`/api/admin/events/${eventIds[1]}/staff`, "PUT", { userIds: [ids.staff] })).status === 403, "Staff cannot assign themselves.");
  }
  for (const browser of [clientA, staff]) {
    const events = await (await browser.request("/api/events")).json();
    check(events.events.some((event: { id: string }) => event.id === eventIds[0]), "Assigned or owned event must be visible.");
    check(!events.events.some((event: { id: string }) => event.id === eventIds[1]), "Other client's event must not be visible.");
    check((await browser.request(`/api/events/${eventIds[1]}`)).status === 404, "Cross-tenant event details must return 404.");
    check((await browser.request(`/api/checkins?eventId=${eventIds[1]}`)).status === 404, "Cross-tenant guest lists must return 404.");
  }
  check((await clientB.request(`/api/events/${eventIds[0]}`)).status === 404, "Reverse client isolation must hold.");
  check((await (await unlinked.request("/api/events")).json()).events.length === 0, "Unlinked client must see no events.");
  for (const [browser, path] of [[clientA, "/admin"], [staff, "/client"], [admin, "/staff"]] as const) {
    const response = await browser.request(path);
    check(response.status < 400 && (response.headers.has("location") || (await response.text()).includes("NEXT_REDIRECT")), "Cross-role pages must redirect server-side.");
  }
  const checkin = { eventId: eventIds[0], code: `${prefix}-code-0`, count: 2 };
  check((await clientA.json("/api/checkins", "POST", checkin)).status === 403, "Client cannot check in guests.");
  check((await staff.json("/api/checkins", "POST", checkin, "https://evil.example")).status === 403, "Cross-origin write must be denied.");
  check((await staff.json("/api/checkins", "POST", { ...checkin, count: 3 })).status === 400, "Guest quota must be enforced.");
  check((await staff.json("/api/checkins", "POST", { eventId: eventIds[1], code: `${prefix}-code-1`, count: 1 })).status === 404, "Unassigned check-in must be denied.");
  const writes = await Promise.all([staff.json("/api/checkins", "POST", checkin), staff.json("/api/checkins", "POST", checkin)]);
  check(writes.map((r) => r.status).sort().join(",") === "201,409", "Concurrent check-in must be recorded exactly once.");
  const report = await (await clientA.request(`/api/checkins?eventId=${eventIds[0]}`)).json();
  check(report.invitations[0].checkedInCount === 2, "Client report must show correct attendance.");

  const createdResponse = await admin.json("/api/admin/users", "POST", { email: `${prefix}-managed@example.invalid`, name: "Managed Staff", password, role: "STAFF" });
  check(createdResponse.status === 201, "Admin can create staff accounts.");
  const createdBody = await createdResponse.json();
  userIds.push(createdBody.user.id);
  check(!JSON.stringify(createdBody).includes("passwordHash"), "Account API must never expose hashes.");
  check((await admin.json(`/api/admin/events/${eventIds[0]}/staff`, "PUT", { userIds: [] })).ok, "Admin can revoke event assignment.");
  check((await staff.request(`/api/events/${eventIds[0]}`)).status === 404, "Assignment revocation takes effect immediately.");
  check((await admin.json(`/api/admin/users/${ids.staff}`, "PATCH", { name: "Changed Staff", role: "STAFF", password: randomBytes(24).toString("base64url") })).ok, "Admin can reset staff password.");
  check((await staff.request("/api/events")).status === 401, "Password change must invalidate old JWTs.");

  const { csrfToken } = await (await clientA.request("/api/auth/csrf")).json();
  await clientA.json("/api/auth/session", "POST", { csrfToken, data: { user: { role: "SUPER_ADMIN", clientId: clientIds[1] } } });
  check((await clientA.session()).user.role === "CLIENT", "Client-supplied session role must be ignored.");
  check((await clientA.request(`/api/events/${eventIds[1]}`)).status === 404, "Client-supplied ownership must be ignored.");
  const external = new BrowserSession();
  const redirectResult = await (await external.login(adminEmail, password, "https://evil.example")).json();
  check(new URL(redirectResult.url).origin === new URL(base).origin, "External callback URL must never be used.");
  const logoutCsrf = await (await clientA.request("/api/auth/csrf")).json();
  await clientA.request("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Origin: base }, body: new URLSearchParams({ csrfToken: logoutCsrf.csrfToken, callbackUrl: "/login" }) });
  check(!(await clientA.session())?.user, "Logout must clear the session.");
  check((await clientA.request("/api/events")).status === 401, "Logged-out sessions cannot access APIs.");
  await prisma.user.update({ where: { id: ids.clientB }, data: { role: "STAFF", clientId: null } });
  check((await clientB.request("/api/events")).status === 401, "Role changes must invalidate old JWTs.");
  console.log(`Auth end-to-end: ${assertions} assertions passed.`);
}

main().catch((error) => {
  // Only assertion messages are emitted; never dump HTTP bodies, cookies or credentials.
  console.error("Auth E2E failed:", error instanceof Error && !error.message.includes("prisma") ? error.message : "Database/test setup error.");
  process.exitCode = 1;
}).finally(async () => {
  try {
    await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    console.log("Temporary auth fixtures cleaned up.");
  } finally { await prisma.$disconnect(); }
});
