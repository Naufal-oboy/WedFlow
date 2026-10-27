import assert from "node:assert/strict";
import { test } from "node:test";
import { clientSchema, eventSchema, eventDateTime, localEventInputs, listSchema, slugify } from "../src/features/management/validation";

const event = { clientId: "00000000-0000-4000-8000-000000000001", name: "Ayu & Bima", slug: "ayu-bima", date: "2030-05-20", time: "00:15", location: "Jakarta", status: "DRAFT" };
test("event dates reject impossible dates and invalid clocks", () => {
  assert.equal(eventSchema.safeParse(event).success, true);
  for (const date of ["2030-02-29", "2030-13-01", "0000-01-01"]) assert.equal(eventSchema.safeParse({ ...event, date }).success, false);
  for (const time of ["24:00", "09:60", "9:30", ""]) assert.equal(eventSchema.safeParse({ ...event, time }).success, false);
  assert.equal(eventSchema.safeParse({ ...event, status: "UNKNOWN" }).success, false);
});
test("WIB midnight roundtrips correctly across UTC calendar boundaries", () => {
  const utc = eventDateTime(event.date, event.time);
  assert.equal(utc.toISOString(), "2030-05-19T17:15:00.000Z");
  assert.deepEqual(localEventInputs(utc), { date: event.date, time: event.time });
  assert.equal(eventDateTime("2030-05-20").toISOString(), "2030-05-19T17:00:00.000Z");
});
test("slug validation rejects URLs, traversal and ambiguous separators", () => {
  for (const slug of ["Ayu Bima", "../event", "https://example.com", "-ayu", "ayu-", "ayu--bima", "ab"]) assert.equal(eventSchema.safeParse({ ...event, slug }).success, false);
  assert.equal(slugify("  Ayu & Bíma  "), "ayu-bima");
});
test("client validation normalizes contacts and rejects invalid values", () => {
  assert.deepEqual(clientSchema.parse({ name: " Ayu Bima ", email: " HELLO@EXAMPLE.COM ", phone: "", type: "COUPLE" }), { name: "Ayu Bima", email: "hello@example.com", phone: null, type: "COUPLE" });
  for (const input of [{ name: " " }, { email: "bad" }, { phone: "not-a-phone" }, { type: "ADMIN" }]) assert.equal(clientSchema.safeParse({ name: "Ayu", email: "", phone: "", type: "COUPLE", ...input }).success, false);
});
test("list validation bounds pagination and rejects inverted date ranges", () => {
  for (const page of [0, -1, 1.5, Infinity, "NaN", 100001]) assert.equal(listSchema.safeParse({ page }).success, false);
  assert.equal(listSchema.safeParse({ from: "2030-05-21", to: "2030-05-20" }).success, false);
  assert.equal(listSchema.safeParse({ from: "2030-05-20", to: "2030-05-20" }).success, true);
  assert.equal(listSchema.parse({}).page, 1);
});
