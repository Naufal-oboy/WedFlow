import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { compare } from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/features/auth/password";
import { bootstrapSuperAdmin } from "../src/features/auth/bootstrap";
import { testQrHttp } from "./test-qr-http";

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

  await prisma.event.createMany({ data: eventIds.map((id, index) => ({ id, clientId: clientIds[index], name: `${prefix}-event-${index}`, slug: `${prefix}-${index}`, status: "ACTIVE", eventDate: new Date("2030-01-01T08:00:00Z") })) });
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
  await testQrHttp({ admin, guest, client: clientA, staff, eventIds, invitationIds, base });
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
  check(report.invitations.find((invitation: { id: string }) => invitation.id === invitationIds[0]).checkedInCount === 2, "Client report must show correct attendance.");

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
  // Client/event management uses the same authenticated sessions and isolated fixtures.
  for (const path of ["/api/admin/clients", "/api/admin/events"]) {
    check((await new BrowserSession().request(path)).status === 401, "Management lists require login.");
    check((await unlinked.request(path)).status === 403, "Management lists require super admin.");
    check((await unlinked.json(path, "POST", {})).status === 403, "Management mutations require super admin.");
  }
  const clientInput = { name: `${prefix}-managed-client`, email: "CONTACT@example.invalid", phone: "+62 812345678", type: "WEDDING_ORGANIZER" };
  check((await admin.json("/api/admin/clients", "POST", { ...clientInput, name: " " })).status === 400, "Invalid client data is rejected server-side.");
  check((await admin.json("/api/admin/clients", "POST", clientInput, "https://evil.example")).status === 403, "Management writes reject foreign origins.");
  const newClientResponse = await admin.json("/api/admin/clients", "POST", clientInput);
  check(newClientResponse.status === 201, "Admin can create clients.");
  const managedClient = (await newClientResponse.json()).client;
  clientIds.push(managedClient.id);
  check(managedClient.email === "contact@example.invalid" && managedClient.status === "ACTIVE", "Client normalization and default status apply.");
  check((await admin.json(`/api/admin/clients/${managedClient.id}`, "PATCH", { ...clientInput, name: `${prefix}-edited-client` })).ok, "Admin can edit clients.");
  check((await admin.request(`/api/admin/clients/${managedClient.id}`)).ok, "Client detail is available.");
  const filteredClients = await (await admin.request(`/api/admin/clients?q=${prefix}&type=WEDDING_ORGANIZER&status=ACTIVE&page=1`)).json();
  check(filteredClients.total === 1 && filteredClients.clients[0].id === managedClient.id, "Client filters combine correctly.");
  const eventInput = { clientId: managedClient.id, name: `${prefix}-managed-event`, slug: `${prefix}-managed`, date: "2031-06-20", time: "00:30", location: "Jakarta", status: "DRAFT" };
  const newEventResponse = await admin.json("/api/admin/events", "POST", eventInput);
  check(newEventResponse.status === 201, "Admin can create events.");
  const managedEvent = (await newEventResponse.json()).event;
  eventIds.push(managedEvent.id);
  check(managedEvent.eventDate === "2031-06-19T17:30:00.000Z", "WIB event time is stored as UTC.");
  check((await admin.json("/api/admin/events", "POST", eventInput)).status === 409, "Duplicate slugs return conflict without overwriting.");
  check((await admin.json("/api/admin/events", "POST", { ...eventInput, slug: `${prefix}-invalid`, date: "2031-02-30" })).status === 400, "Impossible dates are rejected by server.");
  check((await admin.json(`/api/admin/events/${managedEvent.id}`, "PATCH", { ...eventInput, clientId: clientIds[0] })).status === 409, "Event ownership cannot move across clients.");
  check((await admin.json(`/api/admin/events/${managedEvent.id}`, "PATCH", { ...eventInput, status: "ACTIVE" })).ok, "Admin can edit event status.");
  const filteredEvents = await (await admin.request(`/api/admin/events?clientId=${managedClient.id}&from=2031-06-20&to=2031-06-20&status=ACTIVE`)).json();
  check(filteredEvents.total === 1 && filteredEvents.events[0].id === managedEvent.id, "Date filters use inclusive WIB days.");
  check((await admin.request("/api/admin/events?from=2031-06-21&to=2031-06-20")).status === 400, "Inverted date filters are rejected.");
  for (const path of ["/admin/clients", `/admin/clients/${managedClient.id}`, `/admin/clients/${managedClient.id}/edit`, "/admin/clients/new", "/admin/events", `/admin/events/${managedEvent.id}`, `/admin/events/${managedEvent.id}/edit`, "/admin/events/new", "/admin/staff"]) {
    const response = await admin.request(path);
    const html = await response.text();
    check(response.ok && !html.includes('"digest":"') && !html.includes("Data belum dapat dimuat"), `Management page renders: ${path}`);
  }
  const managedStaff = new BrowserSession();
  await managedStaff.login(`${prefix}-managed@example.invalid`);
  const managedStaffId = createdBody.user.id;
  for (const id of [eventIds[0], managedEvent.id]) check((await admin.json(`/api/admin/events/${id}/staff`, "PUT", { userIds: [managedStaffId] })).ok, "One staff can be assigned to multiple events.");
  check((await managedStaff.request(`/api/events/${managedEvent.id}`)).ok, "Assigned staff can access new event.");
  check((await admin.json(`/api/admin/events/${managedEvent.id}/staff`, "PUT", { userIds: [ids.unlinked] })).status === 400, "Non-staff users cannot be assigned.");
  check((await admin.json(`/api/admin/events/${managedEvent.id}/staff`, "PUT", { userIds: [] })).ok, "Assignment can be removed.");
  check((await managedStaff.request(`/api/events/${managedEvent.id}`)).status === 404, "Removal revokes access immediately.");
  check((await managedStaff.request(`/api/events/${eventIds[0]}`)).ok, "Other event assignments are preserved.");
  check((await admin.json(`/api/admin/events/${managedEvent.id}/staff`, "PUT", { userIds: [managedStaffId] })).ok, "Staff can be reassigned.");
  const inactiveAccountResponse = await admin.json("/api/admin/users", "POST", { email: `${prefix}-inactive@example.invalid`, name: "Inactive Client", password, role: "CLIENT", clientId: managedClient.id });
  check(inactiveAccountResponse.status === 201, "Managed client account can be linked.");
  const inactiveAccount = (await inactiveAccountResponse.json()).user;
  userIds.push(inactiveAccount.id);
  const inactiveBrowser = new BrowserSession();
  await inactiveBrowser.login(`${prefix}-inactive@example.invalid`);
  check((await inactiveBrowser.request(`/api/events/${managedEvent.id}`)).ok, "Client can read own event before deactivation.");
  check((await admin.json(`/api/admin/clients/${managedClient.id}/status`, "PATCH", { status: "INACTIVE" })).ok, "Client can be deactivated.");
  check((await inactiveBrowser.request("/api/events")).status === 401, "Deactivation invalidates client sessions.");
  await inactiveBrowser.login(`${prefix}-inactive@example.invalid`);
  check(!(await inactiveBrowser.session())?.user, "Inactive clients cannot log in again.");
  check((await managedStaff.request(`/api/events/${managedEvent.id}`)).status === 404, "Inactive clients block staff access.");
  check((await admin.json("/api/admin/events", "POST", { ...eventInput, slug: `${prefix}-inactive-event` })).status === 409, "Inactive clients cannot receive new events.");
  check(await prisma.event.count({ where: { id: managedEvent.id } }) === 1, "Deactivation preserves events.");
  check(await prisma.eventStaff.count({ where: { eventId: managedEvent.id } }) === 1, "Deactivation preserves assignments.");
  check((await admin.json(`/api/admin/clients/${managedClient.id}/status`, "PATCH", { status: "ACTIVE" })).ok, "Client can be reactivated.");
  check((await managedStaff.request(`/api/events/${managedEvent.id}`)).ok, "Reactivation restores existing staff access.");
  console.log(`Auth and management end-to-end: ${assertions} assertions passed.`);
}

main().catch((error) => {
  // Only assertion messages are emitted; never dump HTTP bodies, cookies or credentials.
  console.error("Auth E2E failed:", error instanceof Error && !error.message.includes("prisma") ? error.message : "Database/test setup error.");
  process.exitCode = 1;
}).finally(async () => {
  try {
    await prisma.invitation.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    console.log("Temporary auth fixtures cleaned up.");
  } finally { await prisma.$disconnect(); }
});
