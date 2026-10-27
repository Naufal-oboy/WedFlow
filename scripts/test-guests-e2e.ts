import "dotenv/config";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/features/auth/password";

const base = process.env.AUTH_TEST_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use a local test server.");
const prefix = `guest-test-${randomUUID()}`;
const password = randomBytes(24).toString("base64url");
const clientIds = [randomUUID(), randomUUID()];
const eventIds = [randomUUID(), randomUUID()];
const userIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
let assertions = 0;
function check(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
  assertions++;
}
class Session {
  cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    const result = await fetch(new URL(path, base), { ...init, headers, redirect: "manual" });
    for (const cookie of result.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return result;
  }
  async json(path: string, method: string, data?: unknown, origin = base) {
    return this.request(path, { method, headers: { "Content-Type": "application/json", Origin: origin }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  }
  async login(index: number) {
    const csrf = await (await this.request("/api/auth/csrf")).json();
    await this.request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: base }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: `${prefix}-${index}@example.invalid`, password }) });
    check(!!(await (await this.request("/api/auth/session")).json()).user, "Fixture login succeeds.");
  }
}
async function main() {
  check((await fetch(`${base}/api/health`)).ok, "Local server is healthy.");
  await prisma.client.createMany({ data: clientIds.map((id) => ({ id, name: prefix })) });
  await prisma.event.createMany({ data: eventIds.map((id, index) => ({ id, name: `${prefix}-${index}`, slug: `${prefix}-${index}`, clientId: clientIds[index], eventDate: new Date("2030-01-01T08:00:00Z"), status: "ACTIVE" })) });
  const passwordHash = await hashPassword(password);
  for (const [index, id] of userIds.entries()) await prisma.user.create({ data: { id, name: `Guest Test ${index}`, email: `${prefix}-${index}@example.invalid`, passwordHash, role: index === 0 ? "SUPER_ADMIN" : index === 1 ? "STAFF" : "CLIENT", clientId: index >= 2 ? clientIds[index - 2] : null } });
  await prisma.eventStaff.create({ data: { eventId: eventIds[0], userId: userIds[1] } });
  const admin = new Session(), staff = new Session(), clientA = new Session(), clientB = new Session(), anonymous = new Session();
  for (const [index, session] of [admin, staff, clientA, clientB].entries()) await session.login(index);
  const path = `/api/admin/events/${eventIds[0]}/guests`, other = `/api/admin/events/${eventIds[1]}/guests`;
  const input = { guestName: "  Budi   Santoso ", guestQuota: 3 };
  for (const data of [{ ...input, guestName: " " }, { ...input, guestQuota: 0 }, { ...input, guestQuota: 1.5 }, { ...input, code: "chosen" }, { ...input, checkedInCount: 2 }, { ...input, guestName: "=SUM(1)" }]) check((await admin.json(path, "POST", data)).status === 400, "Invalid guest input is rejected.");
  check((await admin.json(path, "POST", input, "https://evil.example")).status === 403, "Origin protection applies.");
  check((await admin.json(`/api/admin/events/${randomUUID()}/guests`, "POST", input)).status === 404, "Unknown event cannot receive invitations.");
  check((await admin.json("/api/admin/events/bad-id/guests", "POST", input)).status === 400, "Malformed event ID is rejected.");
  const created = await admin.json(path, "POST", input);
  check(created.status === 201, "Admin creates a guest.");
  const guest = (await created.json()).guest;
  check(guest.guestName === "Budi Santoso" && guest.code.length >= 32, "Name normalization and random opaque code apply.");
  const sameName = (await (await admin.json(path, "POST", input)).json()).guest;
  check(sameName.id !== guest.id && sameName.code !== guest.code, "Identical names get independent unique codes.");
  let uniqueRejected = false;
  try { await prisma.invitation.create({ data: { eventId: eventIds[1], guestName: "Constraint check", code: guest.code } }); }
  catch (error) { uniqueRejected = typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }
  check(uniqueRejected, "Database UNIQUE code constraint is enforced across events.");

  for (const session of [anonymous, staff, clientA, clientB]) {
    const expected = session === anonymous ? 401 : 403;
    for (const [route, method, data] of [[path, "GET", undefined], [path, "POST", input], [`${path}/${guest.id}`, "GET", undefined], [`${path}/${guest.id}`, "PATCH", input], [`${path}/${guest.id}`, "DELETE", undefined], [`${path}/import`, "POST", { mode: "preview", csv: "guestName,guestQuota\nA,1" }]] as const) {
      const response = await session.json(route, method, data);
      check(response.status === expected, "Every guest API enforces admin access.");
      check(!(await response.text()).includes(guest.code), "Rejected response never exposes the invitation code.");
    }
  }
  for (const method of ["GET", "PATCH", "DELETE"]) check((await admin.json(`${other}/${guest.id}`, method, method === "PATCH" ? input : undefined)).status === 404, "Guest ID cannot cross event boundaries.");
  check((await (await admin.request(other)).json()).total === 0, "Other event list stays empty.");
  const edited = await admin.json(`${path}/${guest.id}`, "PATCH", { guestName: "Budi Updated", guestQuota: 4 });
  check(edited.ok && (await edited.json()).guest.code === guest.code, "Editing retains the invitation code.");
  const checkin = { eventId: eventIds[0], code: guest.code, count: 3 };
  check((await staff.json("/api/checkins", "POST", { ...checkin, count: 5 })).status === 400, "Existing check-in quota validation remains active.");
  check((await staff.json("/api/checkins", "POST", checkin)).status === 201, "Created invitation works with existing check-in.");
  const before = (await (await admin.request(`${path}/${guest.id}`)).json()).guest;
  check(before.checkedInBy.id === userIds[1] && before.checkedInCount === 3 && before.checkedInAt, "Detail includes correct attendance and operator.");
  check(!JSON.stringify(before).includes("passwordHash") && !JSON.stringify(before).includes("@example.invalid"), "Guest detail excludes account secrets and contacts.");
  check((await admin.json(`${path}/${guest.id}`, "PATCH", { guestName: "Budi Updated", guestQuota: 2 })).status === 409, "Quota below attendance is rejected.");
  check((await admin.json(`${path}/${guest.id}`, "PATCH", { guestName: "Budi Final", guestQuota: 3 })).ok, "Quota equal to attendance is accepted.");
  const after = (await (await admin.request(`${path}/${guest.id}`)).json()).guest;
  check(before.checkedInAt === after.checkedInAt && after.checkedInBy.id === before.checkedInBy.id && after.code === guest.code, "Editing preserves attendance history.");
  check((await admin.json(`${path}/${guest.id}`, "DELETE")).status === 409, "Checked-in guest cannot be deleted.");
  check((await staff.json("/api/checkins", "POST", checkin)).status === 409, "Repeat check-in is still rejected.");
  check((await admin.json(`${path}/${sameName.id}`, "DELETE")).ok, "Unused invitation can be deleted.");
  check((await admin.request(`${path}/${sameName.id}`)).status === 404, "Deleted invitation is no longer found.");
  check(await prisma.event.count({ where: { id: eventIds[0] } }) === 1, "Guest deletion preserves the event.");

  const invalidCsv = "guestName,guestQuota\n,1\nInvalid,0\nValid,2\n=SUM(1),1";
  const invalid = await admin.json(`${path}/import`, "POST", { mode: "preview", csv: invalidCsv });
  check(invalid.ok, "Invalid rows return a reviewable preview.");
  const invalidPreview = await invalid.json();
  check(invalidPreview.valid === 1 && invalidPreview.invalid === 3 && invalidPreview.rows[0].line === 2, "Preview reports counts and physical line numbers.");
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv: invalidCsv, token: invalidPreview.token })).status === 400, "Invalid preview cannot be committed.");
  for (const csv of ["name,quota\nA,1", "guestName,guestQuota\n\ufffd,1", "x".repeat(256 * 1024 + 1), "guestName,guestQuota\n" + "A,1\n".repeat(501)]) check((await admin.json(`${path}/import`, "POST", { mode: "preview", csv })).status === 400, "Invalid CSV headers, encoding and limits are rejected.");
  const csv = "guestName,guestQuota\n" + Array.from({ length: 23 }, (_, index) => `Import ${String(index).padStart(2, "0")},2`).join("\n");
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv })).status === 409, "Import requires a prior preview token.");
  const preview = await (await admin.json(`${path}/import`, "POST", { mode: "preview", csv })).json();
  check(preview.valid === 23 && preview.invalid === 0, "Valid CSV previews all rows.");
  check(await prisma.invitation.count({ where: { eventId: eventIds[0] } }) === 1, "Preview never persists guests.");
  check((await admin.json(`${other}/import`, "POST", { mode: "confirm", csv, token: preview.token })).status === 409, "Preview cannot be reused across events.");
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv: csv + "\nChanged,1", token: preview.token })).status === 409, "Preview binds exact CSV contents.");
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv, token: preview.token + "x" })).status === 409, "Tampered preview token is rejected.");
  // Signed negative fixtures verify claim checks independently of signature validation.
  function changedClaims(changes: object) {
    const claims = JSON.parse(Buffer.from(preview.token.split(".")[0], "base64url").toString("utf8"));
    const payload = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString("base64url");
    const signature = createHmac("sha256", process.env.AUTH_SECRET!).update(`guest-import:${payload}`).digest("base64url");
    return `${payload}.${signature}`;
  }
  const wrongUserToken = changedClaims({ userId: userIds[1] });
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv, token: wrongUserToken })).status === 409, "Preview is bound to the originating account.");
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv, token: changedClaims({ expires: Date.now() - 1000 }) })).status === 409, "Expired preview cannot be confirmed.");
  const imported = await admin.json(`${path}/import`, "POST", { mode: "confirm", csv, token: preview.token });
  check(imported.status === 201 && (await imported.json()).imported === 23, "Valid CSV commits successfully.");
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv, token: preview.token })).status === 409, "Replayed confirmation cannot duplicate guests.");
  check(await prisma.invitation.count({ where: { eventId: eventIds[0] } }) === 24, "Replay leaves row count unchanged.");
  const pageOne = await (await admin.request(`${path}?sort=name_asc`)).json();
  const pageTwo = await (await admin.request(`${path}?sort=name_asc&page=2`)).json();
  check(pageOne.total === 24 && pageOne.guests.length === 20 && pageTwo.guests.length === 4, "Pagination runs on the server.");
  check(!pageTwo.guests.some((row: { id: string }) => pageOne.guests.some((first: { id: string }) => first.id === row.id)), "Pagination has no overlapping records.");
  check((await (await admin.request(`${path}?q=import&attendance=absent`)).json()).total === 23, "Search and attendance filter combine.");
  check((await (await admin.request(`${path}?q=${guest.code}&attendance=present`)).json()).total === 1, "Code search and present filter work.");
  check((await (await admin.request(`${path}?sort=name_desc`)).json()).guests[0].guestName === "Import 22", "Name descending sort applies.");
  check((await admin.request(`${path}?page=-1`)).status === 400, "Invalid pagination is rejected.");
  const importedGuests = await prisma.invitation.findMany({ where: { eventId: eventIds[0], guestName: { startsWith: "Import " } } });
  check(new Set(importedGuests.map((row) => row.code)).size === 23, "Every imported row has a unique code.");
  const importedCheckin = { eventId: eventIds[0], code: importedGuests[0].code, count: 2 };
  check((await staff.json("/api/checkins", "POST", importedCheckin)).status === 201, "Imported code works with unchanged check-in API.");
  check((await clientB.request(`/api/checkins?eventId=${eventIds[0]}`)).status === 404, "Other client cannot read attendance.");
  check((await staff.json("/api/checkins", "POST", { ...importedCheckin, eventId: eventIds[1] })).status === 404, "Imported codes remain event-scoped.");
  const duplicateCsv = "guestName,guestQuota\nBudi Final,1\nNew Same Name,1\nnew same name,2";
  const duplicate = await (await admin.json(`${path}/import`, "POST", { mode: "preview", csv: duplicateCsv })).json();
  check(duplicate.duplicates === 3, "Preview detects existing and within-file duplicate names.");
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv: duplicateCsv, token: duplicate.token })).status === 409, "Duplicates require explicit acknowledgement.");
  check((await admin.json(`${path}/import`, "POST", { mode: "confirm", csv: duplicateCsv, token: duplicate.token, allowDuplicateNames: true })).status === 201, "Acknowledged duplicates become distinct invitations.");

  // Race changes against the existing check-in conditional update.
  for (let index = 0; index < 3; index++) {
    const race = (await (await admin.json(path, "POST", { guestName: `Race ${index}`, guestQuota: 5 })).json()).guest;
    await Promise.all([admin.json(`${path}/${race.id}`, "PATCH", { guestName: `Race ${index}`, guestQuota: 1 }), staff.json("/api/checkins", "POST", { eventId: eventIds[0], code: race.code, count: 5 })]);
    const saved = await prisma.invitation.findUniqueOrThrow({ where: { id: race.id } });
    check(saved.guestQuota >= (saved.checkedInCount ?? 0), "Concurrent quota edit never drops below attendance.");
    const unused = (await (await admin.json(path, "POST", { guestName: `Delete race ${index}`, guestQuota: 1 })).json()).guest;
    const results = await Promise.all([admin.json(`${path}/${unused.id}`, "DELETE"), staff.json("/api/checkins", "POST", { eventId: eventIds[0], code: unused.code, count: 1 })]);
    check(!(results[0].ok && results[1].ok), "Delete and check-in cannot both succeed.");
    const remaining = await prisma.invitation.findUnique({ where: { id: unused.id } });
    check(!results[1].ok || !!remaining?.checkedInAt, "Successful check-in history survives concurrent deletion.");
  }
  for (const route of [`/admin/events/${eventIds[0]}/guests`, `/admin/events/${eventIds[0]}/guests/${guest.id}`]) {
    const response = await admin.request(route), html = await response.text();
    check(response.ok && html.includes("Budi Final") && !html.includes("Undangan belum dapat dimuat"), "Guest pages render with authenticated data.");
    const denied = await clientA.request(route);
    check(!(await denied.text()).includes(guest.code), "Client cannot read admin guest pages.");
  }
  console.log(`Guest management end-to-end: ${assertions} assertions passed.`);
}
main().catch((error) => {
  console.error("Guest E2E failed:", error instanceof Error && !error.message.includes("prisma") ? error.message : "Database/test setup error.");
  process.exitCode = 1;
}).finally(async () => {
  try {
    // IDs below belong exclusively to this test invocation, including imported invitations.
    await prisma.invitation.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.eventStaff.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    console.log("Temporary guest fixtures cleaned up.");
  } finally { await prisma.$disconnect(); }
});
