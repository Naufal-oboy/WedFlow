import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { confirmSchema, searchSchema, verifySchema } from "../src/features/checkins/validation";
import { createVerification, readVerification } from "../src/features/checkins/verification";
import { checkinRateLimit } from "../src/features/checkins/rate-limit";
import { scannerSession } from "../src/features/checkins/scanner-session";

test("confirmation requires explicit consent, a verification token and a positive integer", () => {
  const input = { eventId: randomUUID(), verificationToken: "signed", confirmed: true, count: 1 };
  assert.equal(confirmSchema.safeParse(input).success, true);
  for (const change of [{ confirmed: false }, { confirmed: undefined }, { verificationToken: undefined }, { count: 0 }, { count: -1 }, { count: 1.5 }, { count: 1001 }, { count: "1" }, { code: "bypass" }]) assert.equal(confirmSchema.safeParse({ ...input, ...change }).success, false);
});

test("name searches and verification requests are bounded and method-specific", () => {
  assert.equal(searchSchema.parse("  Budi  "), "Budi");
  for (const q of ["a", "", "a".repeat(101), "aa\u0000", "aa\u202e"]) assert.equal(searchSchema.safeParse(q).success, false);
  const eventId = randomUUID();
  assert.equal(verifySchema.safeParse({ eventId, method: "NAME_SEARCH", invitationId: randomUUID() }).success, true);
  for (const code of ["https://example.com", '{"code":"bad"}', "a\nb", "a".repeat(201)]) {
    assert.equal(verifySchema.safeParse({ eventId, method: "QR", code }).success, false);
  }
  assert.equal(verifySchema.safeParse({ eventId, method: "NAME_SEARCH", code: "wrong-kind" }).success, false);
});

test("verification signatures bind account, event, method and invitation snapshot", () => {
  const claims = { eventId: randomUUID(), userId: randomUUID(), invitationId: randomUUID(), method: "NAME_SEARCH" as const, count: 2, quota: 4, name: "Budi" };
  const token = createVerification(claims);
  const decoded = readVerification(token, claims.eventId, claims.userId);
  assert.equal(decoded.count, 2); assert.equal(decoded.method, "NAME_SEARCH");
  assert.notEqual(readVerification(createVerification(claims), claims.eventId, claims.userId).id, decoded.id);
  assert.throws(() => readVerification(token + "x", claims.eventId, claims.userId));
  assert.throws(() => readVerification(token, randomUUID(), claims.userId));
  assert.throws(() => readVerification(token, claims.eventId, randomUUID()));
});

test("authenticated rate budget is bounded and resets after a minute", () => {
  const id = randomUUID();
  for (let i = 0; i < 120; i++) checkinRateLimit(id, 0);
  assert.throws(() => checkinRateLimit(id, 0), /Terlalu banyak/);
  assert.doesNotThrow(() => checkinRateLimit(id, 60_000));
});

test("camera is stopped and cleared exactly once on repeated disposal", async () => {
  const actions: string[] = [];
  const session = scannerSession({ start: async () => { actions.push("start"); }, stop: async () => { actions.push("stop"); }, clear: () => { actions.push("clear"); } }, () => undefined);
  await session.ready;
  await Promise.all([session.dispose(), session.dispose()]);
  assert.deepEqual(actions, ["start", "stop", "clear"]);
});

test("camera cleanup waits for pending permission/start and ignores scans after closure", async () => {
  let finish!: () => void;
  const actions: string[] = [];
  const session = scannerSession({ start: () => new Promise<void>((resolve) => { finish = resolve; }), stop: async () => { actions.push("stop"); }, clear: () => { actions.push("clear"); } }, () => actions.push("decoded"));
  await Promise.resolve();
  const closing = session.dispose();
  session.decode("late QR");
  assert.deepEqual(actions, []);
  finish(); await closing;
  assert.deepEqual(actions, ["stop", "clear"]);
});

test("repeated QR frames produce a single verification per scanner session", async () => {
  const codes: string[] = [];
  const session = scannerSession({ start: async () => undefined, stop: async () => undefined, clear: () => undefined }, (code) => codes.push(code));
  await session.ready;
  session.decode("same"); session.decode("same"); session.decode("other");
  assert.deepEqual(codes, ["same"]);
  await session.dispose();
});

test("failed camera start/stop still runs final cleanup", async () => {
  let cleared = false;
  const session = scannerSession({ start: async () => { throw new Error("denied"); }, stop: async () => { throw new Error("already stopped"); }, clear: () => { cleared = true; } }, () => undefined);
  await assert.rejects(session.ready);
  await assert.rejects(session.dispose());
  assert.equal(cleared, true);
});
