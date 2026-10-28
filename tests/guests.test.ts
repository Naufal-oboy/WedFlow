import assert from "node:assert/strict";
import { test } from "node:test";
import { guestSchema, guestFiltersSchema, importSchema, MAX_CSV_BYTES, MAX_CSV_ROWS } from "../src/features/guests/validation";
import { parseGuestCsv, safePreviewCell } from "../src/features/guests/csv";

test("guest input normalizes Unicode and whitespace without changing the invitation identity", () => {
  assert.deepEqual(guestSchema.parse({ guestName: "  Jose\u0301   Santoso \n", guestQuota: 2 }), { guestName: "José Santoso", guestQuota: 2 });
  for (const extra of [{ code: "forged" }, { eventId: "forged" }, { checkedInCount: 9 }]) assert.equal(guestSchema.safeParse({ guestName: "A", guestQuota: 1, ...extra }).success, false);
});
test("names and quotas reject invalid and unsafe input", () => {
  for (const guestName of ["", "  ", "=SUM(1)", "+cmd", "-1", "@test", "x\u0000", "x\u202e", "a".repeat(151)]) assert.equal(guestSchema.safeParse({ guestName, guestQuota: 1 }).success, false);
  for (const guestQuota of [0, -1, 1.5, 1001, "2", null, NaN, Infinity]) assert.equal(guestSchema.safeParse({ guestName: "Budi", guestQuota }).success, false);
});
test("pagination, attendance and sorting have bounded allowlists", () => {
  assert.equal(guestFiltersSchema.parse({}).page, 1);
  for (const input of [{ page: 0 }, { page: 1.2 }, { page: 100001 }, { sort: "code" }, { attendance: "all" }, { q: "a".repeat(151) }]) assert.equal(guestFiltersSchema.safeParse(input).success, false);
  assert.equal(guestFiltersSchema.parse({ sort: "name_desc", attendance: "present", page: "2" }).page, 2);
});
test("CSV accepts BOM, CRLF, reordered headers, commas, escaped quotes and multiline fields", () => {
  const parsed = parseGuestCsv('\ufeffguestQuota,guestName\r\n2,"Budi, Santoso"\r\n1,"Siti ""A"""\r\n3,"Andi\r\nWijaya"\r\n');
  assert.equal(parsed.valid, 3);
  assert.deepEqual(parsed.rows.map((row) => row.data?.guestName), ["Budi, Santoso", 'Siti "A"', "Andi Wijaya"]);
  assert.deepEqual(parsed.rows.map((row) => row.line), [2, 3, 4]);
});
test("CSV reports invalid physical row numbers and does not silently drop empty data cells", () => {
  const parsed = parseGuestCsv('guestName,guestQuota\n"Budi\nSantoso",2\n,\nSiti,0\nAndi,1.5\nBob,1,extra\n');
  assert.equal(parsed.valid, 1); assert.equal(parsed.invalid, 4);
  assert.deepEqual(parsed.rows.filter((row) => row.errors.length).map((row) => row.line), [4, 5, 6, 7]);
});
test("CSV rejects malformed headers, quote syntax and unsupported encodings", () => {
  for (const csv of ["name,quota\nA,1", "guestName,guestName\nA,1", "guestName;guestQuota\nA;1", 'guestName,guestQuota\n"A,1', 'guestName,guestQuota\n"A"x,1', 'guestName,guestQuota\nA"B,1', "guestName,guestQuota\nA\u0000,1", "guestName,guestQuota\n\ufffd,1", "guestName,guestQuota\n"]) assert.throws(() => parseGuestCsv(csv));
});
test("CSV rejects size and row overflow while accepting the exact row limit", () => {
  assert.throws(() => parseGuestCsv("x".repeat(MAX_CSV_BYTES + 1)), /256 KiB/);
  assert.throws(() => parseGuestCsv("é".repeat(MAX_CSV_BYTES / 2 + 1)), /256 KiB/);
  assert.equal(parseGuestCsv("guestName,guestQuota\n" + "A,1\n".repeat(MAX_CSV_ROWS)).valid, MAX_CSV_ROWS);
  assert.throws(() => parseGuestCsv("guestName,guestQuota\n" + "A,1\n".repeat(MAX_CSV_ROWS + 1)), /500/);
});
test("duplicate names remain distinct valid rows and are marked explicitly", () => {
  const preview = parseGuestCsv("guestName,guestQuota\n Budi ,1\nbudi,2\nSiti,1");
  assert.equal(preview.valid, 3); assert.equal(preview.duplicates, 2);
  assert.equal(preview.rows[2].duplicate, false);
});
test("formula names are invalid and preview cells are neutralized", () => {
  const preview = parseGuestCsv("guestName,guestQuota\n=1+1,1\n@SUM(A1),2\nBudi,=1+1");
  assert.equal(preview.invalid, 3);
  assert.equal(safePreviewCell(" \t=1+1"), "' \t=1+1");
  assert.equal(safePreviewCell("Budi"), "Budi");
});
test("import requests reject arbitrary modes and extra fields", () => {
  assert.equal(importSchema.safeParse({ mode: "save", csv: "x" }).success, false);
  assert.equal(importSchema.safeParse({ mode: "confirm", csv: "x", eventId: "forged" }).success, false);
  assert.equal(importSchema.parse({ mode: "preview", csv: "x" }).allowDuplicateNames, false);
});
