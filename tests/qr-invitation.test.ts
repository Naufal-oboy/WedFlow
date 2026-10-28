import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { generateInvitationCode, invitationFilename, invitationPayload, invitationPng } from "../src/features/invitations/qr";
import { invitationPrintResponse } from "../src/features/invitations/print";
import { parseGuestCsv } from "../src/features/invitations/guest-csv";
import { guestSchema, MAX_CSV_BYTES } from "../src/features/invitations/guest-validation";

test("CSV preview handles BOM, CRLF, quotes, commas and validation atomically", () => {
  const parsed = parseGuestCsv('\uFEFFguestName,guestQuota\r\n"Family, A",2\r\n"Name ""B""",3\r\n');
  assert.deepEqual(parsed, { guests: [{ guestName: "Family, A", guestQuota: 2 }, { guestName: 'Name "B"', guestQuota: 3 }], errors: [] });
  for (const csv of ["", "guestName,guestQuota", "guestName,guestQuota,code\nGuest,1,fake", "guestName,guestQuota\nGuest,0", 'guestName,guestQuota\n"unfinished,2', 'guestName,guestQuota\n"name"bad,2', "guestName,guestQuota\nName,1,extra", "guestName,guestQuota\nName,1.5", "guestName,guestQuota\nName,1001", "x".repeat(MAX_CSV_BYTES + 1), "guestName,guestQuota\n" + "Guest,1\n".repeat(501)]) {
    assert.ok(parseGuestCsv(csv).errors.length, csv.slice(0, 40));
  }
  assert.equal(parseGuestCsv("guestName,guestQuota\n" + "Guest,1\n".repeat(500)).guests.length, 500);
});

test("guest writes accept only name/quota, never token, identity, event or attendance", () => {
  const input = { guestName: " Guest ", guestQuota: 2 };
  assert.deepEqual(guestSchema.parse(input), { guestName: "Guest", guestQuota: 2 });
  for (const field of ["code", "id", "eventId", "checkedInAt", "checkedInCount"]) assert.equal(guestSchema.safeParse({ ...input, [field]: "override" }).success, false);
});

test("codes use 256-bit opaque identities and are unique across a large sample", () => {
  const codes = Array.from({ length: 10000 }, generateInvitationCode);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^WF-[a-f0-9]{64}$/);
});

test("QR roundtrips through an independent decoder with no guest information", async () => {
  const code = generateInvitationCode();
  const png = await invitationPng(code);
  const decoded = PNG.sync.read(png);
  assert.equal(decoded.width, 1024);
  assert.equal(decoded.height, 1024);
  assert.deepEqual([...decoded.data.subarray(0, 4)], [255, 255, 255, 255]);
  const result = jsQR(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height);
  assert.equal(result?.data, code);
  assert.equal(invitationPayload(code), code);
  assert.ok(!result!.data.includes("http"));
  // Only PNG structural chunks: no text, EXIF, names, or other metadata.
  const chunks: string[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    chunks.push(png.toString("ascii", offset + 4, offset + 8));
    offset += length + 12;
  }
  assert.ok(chunks.every((chunk) => ["IHDR", "IDAT", "IEND"].includes(chunk)));
});

test("regenerating an image from a stored code is deterministic", async () => {
  const code = generateInvitationCode();
  assert.deepEqual(await invitationPng(code), await invitationPng(code));
});

test("Guest Management random and import codes retain their exact QR payloads", async () => {
  // Both byte lengths used by Guest Management; HTTP tests exercise its actual
  // create/import endpoints and verify their persisted codes through the decoder.
  for (const bytes of [24, 32]) {
    const code = randomBytes(bytes).toString("base64url");
    assert.equal(invitationPayload(code), code);
    const png = PNG.sync.read(await invitationPng(code));
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, code);
  }
});

test("legacy personal codes, URLs, and malformed tokens cannot become QR payloads", () => {
  for (const value of ["", "Jane Doe", "jane@example.com", "+628123456789", "https://evil.example", "WF-1234", `WF-${"g".repeat(64)}`, "a".repeat(31), "a".repeat(33), "a".repeat(42) + "B"]) {
    assert.throws(() => invitationPayload(value));
  }
});

test("PNG filenames use only a validated invitation ID", () => {
  const id = randomUUID();
  assert.equal(invitationFilename(id), `wedflow-invitation-${id}.png`);
  for (const value of ["../../guest", 'guest\r\nX-Evil: true', "Jane Doe"]) assert.throws(() => invitationFilename(value));
});

test("print card escapes guest/event content, contains the same QR, and has private print policies", async () => {
  const code = generateInvitationCode();
  const response = await invitationPrintResponse({
    guestName: '<script>alert("guest")</script>', guestQuota: 3, code,
    event: { name: 'A & B <img src=x onerror=alert(1)>', eventDate: new Date("2030-05-20T03:00:00Z"), location: 'Hall "Ivory" <script>bad</script>' },
  });
  const html = await response.text();
  assert.match(html, /@media print/);
  assert.match(html, /@page\{size:A4/);
  assert.match(html, /window.print\(\)/);
  assert.match(html, /\.decode\(\)/);
  assert.match(html, /Kuota: 3 orang/);
  assert.match(html, /10\.00 WIB/);
  assert.ok(html.includes(code));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes('<script>alert("guest")'));
  assert.ok(!html.includes("<img src=x"));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
  const encoded = html.match(/src="data:image\/png;base64,([^"]+)"/)![1];
  const png = PNG.sync.read(Buffer.from(encoded, "base64"));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, code);
});
