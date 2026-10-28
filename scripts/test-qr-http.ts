import assert from "node:assert/strict";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { prisma } from "../src/lib/prisma";
import { testQrBrowser } from "./test-qr-browser";

type HttpSession = {
  cookies: Map<string, string>;
  request(path: string, init?: RequestInit): Promise<Response>;
  json(path: string, method: string, data: unknown, origin?: string): Promise<Response>;
};

export async function testQrHttp({ admin, guest, client, staff, eventIds, invitationIds, base }: {
  admin: HttpSession; guest: HttpSession; client: HttpSession; staff: HttpSession;
  eventIds: string[]; invitationIds: string[]; base: string;
}) {
  const collection = `/api/admin/events/${eventIds[0]}/invitations`;
  const input = { guestName: 'QR Test <img src=x onerror=alert(1)>', guestQuota: 3 };
  const create = await admin.json(collection, "POST", input);
  assert.equal(create.status, 201, "Admin creates an invitation with its persistent QR identity");
  const stored = await prisma.invitation.findFirstOrThrow({ where: { eventId: eventIds[0], guestName: input.guestName } });
  invitationIds.push(stored.id);
  assert.match(stored.code, /^WF-[a-f0-9]{64}$/);
  const path = `${collection}/${stored.id}`;
  for (const [session, status] of [[guest, 401], [client, 403], [staff, 403]] as const) {
    for (const suffix of ["/qr", "/qr?download=1", "/print"]) assert.equal((await session.request(path + suffix)).status, status);
    assert.equal((await session.json(collection, "POST", input)).status, status);
    assert.equal((await session.json(path, "PATCH", input)).status, status);
  }
  for (const suffix of ["/qr", "/qr?download=1", "/print"]) {
    assert.equal((await admin.request(`/api/admin/events/${eventIds[1]}/invitations/${stored.id}${suffix}`)).status, 404);
  }
  assert.equal((await admin.request(`${collection}/${invitationIds[0]}/qr`)).status, 409, "Unsafe legacy codes are never silently rotated or exposed in a QR");
  assert.equal((await admin.json(collection, "POST", input, "https://evil.example")).status, 403);
  const firstResponse = await admin.request(`${path}/qr`);
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get("cache-control"), "private, no-store");
  const first = await firstResponse.json();
  const refreshed = await (await admin.request(`${path}/qr`)).json();
  assert.equal(first.invitation.code, stored.code);
  assert.equal(first.pngDataUrl, refreshed.pngDataUrl, "Refresh preserves the same QR");
  assert.equal(first.invitation.guestQuota, 3);
  assert.equal((await admin.json(path, "PATCH", { guestName: "Updated QR guest", guestQuota: 4 })).status, 200);
  const edited = await (await admin.request(`${path}/qr`)).json();
  assert.equal(edited.invitation.guestName, "Updated QR guest");
  assert.equal(edited.invitation.guestQuota, 4);
  assert.equal(edited.invitation.code, stored.code);
  assert.equal(edited.pngDataUrl, first.pngDataUrl, "Editing name/quota cannot change QR identity");
  const download = await admin.request(`${path}/qr?download=1`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "image/png");
  assert.equal(download.headers.get("content-disposition"), `attachment; filename="wedflow-invitation-${stored.id}.png"`);
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  const png = PNG.sync.read(Buffer.from(await download.arrayBuffer()));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
  assert.equal(code, stored.code, "Downloaded PNG decodes to exactly the stored code, with no PII");
  const print = await admin.request(`${path}/print`);
  assert.equal(print.status, 200);
  assert.equal(print.headers.get("cache-control"), "private, no-store");
  const html = await print.text();
  assert.match(html, /Updated QR guest/);
  assert.match(html, /@media print/);
  assert.match(html, /window.print\(\)/);
  assert.ok(html.includes(code!));
  const page = await admin.request(`/admin/events/${eventIds[0]}/guests`);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  for (const label of ["Lihat QR", "Download QR", "Print undangan", "Updated QR guest"]) assert.ok(pageHtml.includes(label), label);
  if (process.env.QR_BROWSER_TESTS === "1") {
    await testQrBrowser({ base, eventId: eventIds[0], invitationId: stored.id, code: stored.code, cookies: admin.cookies });
  }
  const checkin = { eventId: eventIds[0], code, count: 2 };
  assert.equal((await admin.json("/api/checkins", "POST", { ...checkin, eventId: eventIds[1] })).status, 404, "Code cannot be used for a different event even by admin");
  assert.equal((await staff.json("/api/checkins", "POST", { ...checkin, count: 5 })).status, 400);
  const writes = await Promise.all([staff.json("/api/checkins", "POST", checkin), staff.json("/api/checkins", "POST", checkin)]);
  assert.deepEqual(writes.map((response) => response.status).sort(), [201, 409], "Same QR cannot check in twice concurrently");
  assert.equal((await staff.json("/api/checkins", "POST", checkin)).status, 409, "Replay is rejected");
  assert.equal((await admin.json(path, "PATCH", input)).status, 409, "Checked-in quota/history cannot be overwritten");
  const attended = await (await admin.request(`${path}/qr`)).json();
  assert.ok(attended.invitation.checkedInAt);
  assert.equal(attended.invitation.checkedInCount, 2);
  assert.equal(attended.pngDataUrl, first.pngDataUrl);
  const duplicate = await prisma.invitation.create({ data: { ...input, eventId: eventIds[0], code: stored.code } }).then(() => false, (error) => error.code === "P2002");
  assert.equal(duplicate, true, "Database enforces token uniqueness");

  // CSV API checks are run against disposable event fixtures only.
  const upload = async (csv: string, session = admin) => {
    const form = new FormData();
    form.set("file", new File([csv], "guests.csv", { type: "text/csv" }));
    return session.request(`${collection}/import`, { method: "POST", headers: { Origin: base }, body: form });
  };
  assert.equal((await upload("guestName,guestQuota\nCSV guest,2", guest)).status, 401);
  assert.equal((await upload("guestName,guestQuota\nCSV guest,2", staff)).status, 403);
  const countBefore = await prisma.invitation.count({ where: { eventId: eventIds[0] } });
  assert.equal((await upload("guestName,guestQuota\nCSV valid,2\nCSV invalid,0")).status, 400);
  assert.equal(await prisma.invitation.count({ where: { eventId: eventIds[0] } }), countBefore, "Invalid CSV batch is atomic");
  const importedResponse = await upload('guestName,guestQuota\r\n"CSV QR, Family",2\r\nCSV QR Other,1');
  assert.equal(importedResponse.status, 201);
  const imported = await prisma.invitation.findMany({ where: { eventId: eventIds[0], guestName: { startsWith: "CSV QR" } } });
  invitationIds.push(...imported.map(({ id }) => id));
  assert.equal(imported.length, 2);
  assert.equal(new Set(imported.map(({ code: value }) => value)).size, 2);
  for (const invitation of imported) {
    assert.match(invitation.code, /^WF-[a-f0-9]{64}$/);
    assert.equal((await admin.request(`${collection}/${invitation.id}/qr?download=1`)).status, 200);
  }
  console.log("QR HTTP integration passed: roles, event isolation, persistence, PNG decode, print, CSV, database uniqueness and concurrent/replayed check-in.");
}
