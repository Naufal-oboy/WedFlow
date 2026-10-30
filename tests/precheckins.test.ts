import assert from "node:assert/strict";
import test from "node:test";
import { hashTicket, newTicket, publicOrigin, TICKET_TTL_MS } from "../src/features/precheckins/ticket";
import { publicCheckinUrl } from "../src/features/precheckins/qr";
import { lookupSchema, slugSchema, submitSchema } from "../src/features/precheckins/validation";
import { createVerification, readVerification } from "../src/features/checkins/verification";

test("Public ticket tokens are random, opaque, and stored as hashes", () => {
  const tickets = Array.from({ length: 1000 }, newTicket);
  assert.equal(new Set(tickets.map(t => t.token)).size, 1000);
  for (const ticket of tickets) {
    assert.match(ticket.token, /^PCT-[A-Za-z0-9_-]{43}$/);
    assert.equal(hashTicket(ticket.token), ticket.tokenHash);
    assert.notEqual(ticket.token, ticket.tokenHash);
    assert.match(ticket.queueCode, /^[A-F0-9]{8}$/);
  }
  assert.equal(TICKET_TTL_MS, 20 * 60_000);
});
test("Public input is bounded and disallows controls and extra personal fields", () => {
  for (const name of ["a", "a".repeat(101), "Budi\nSantoso", "Budi\u200bSantoso"]) assert.equal(submitSchema.safeParse({ name }).success, false);
  assert.equal(submitSchema.safeParse({ name: "Budi", email: "private@example.com" }).success, false);
  assert.equal(submitSchema.parse({ name: "  Budi Santoso  " }).name, "Budi Santoso");
  assert.equal(slugSchema.safeParse("../other?token=secret").success, false);
  assert.equal(lookupSchema.safeParse({ eventId: "00000000-0000-4000-8000-000000000001", lookup: "12345678" }).success, true);
});
test("Public QR origin comes from validated server configuration", t => {
  const original = process.env.APP_ORIGIN;
  t.after(() => { if (original === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = original; });
  process.env.APP_ORIGIN = "https://wedding.example";
  assert.equal(publicCheckinUrl("budi-siti"), "https://wedding.example/e/budi-siti/checkin");
  assert.notEqual(publicCheckinUrl("budi-siti"), publicCheckinUrl("other"));
  for (const value of ["http://wedding.example", "https://user:pass@wedding.example", "https://wedding.example/evil", "https://wedding.example?foo=1", "javascript:alert(1)"]) {
    process.env.APP_ORIGIN = value; assert.throws(publicOrigin);
  }
  process.env.APP_ORIGIN = "http://localhost:3100"; assert.equal(publicOrigin(), "http://localhost:3100");
});
test("Signed verification binds ticket, event, operator and selected invitation", t => {
  const original = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "unit-test-only-secret".repeat(3);
  t.after(() => { if (original === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = original; });
  const id = "00000000-0000-4000-8000-000000000001";
  const token = createVerification({ eventId: id, invitationId: id, userId: id, method: "PUBLIC_PRECHECKIN", precheckinId: id, count: 0, quota: 4, name: "Budi" });
  assert.equal(readVerification(token, id, id).precheckinId, id);
  assert.throws(() => readVerification(`${token}x`, id, id));
  assert.throws(() => readVerification(token, "00000000-0000-4000-8000-000000000002", id));
  const missing = createVerification({ eventId: id, invitationId: id, userId: id, method: "PUBLIC_PRECHECKIN", count: 0, quota: 4, name: "Budi" });
  assert.throws(() => readVerification(missing, id, id));
});
