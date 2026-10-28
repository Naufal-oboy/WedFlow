import { guestSchema, MAX_CSV_BYTES, MAX_CSV_ROWS } from "./guest-validation";

export type CsvGuest = { guestName: string; guestQuota: number };
export type CsvPreview = { guests: CsvGuest[]; errors: string[] };

// Bounded CSV parser supporting quoted commas/newlines, escaped quotes, BOM, CRLF.
// Header is deliberately narrow: imported identity/token columns are never trusted.
export function parseGuestCsv(input: string): CsvPreview {
  const fail = (message: string): CsvPreview => ({ guests: [], errors: [message] });
  if (new TextEncoder().encode(input).length > MAX_CSV_BYTES) return fail("File CSV maksimal 256 KB.");
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  function finishField() { row.push(field); field = ""; closed = false; }
  function finishRow() {
    finishField();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  }
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; closed = true; }
      } else field += character;
    } else if (character === ",") finishField();
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index++;
      finishRow();
      if (rows.length > MAX_CSV_ROWS + 1) return fail("Maksimal 500 tamu per impor.");
    } else if (character === '"' && field === "" && !closed) quoted = true;
    else {
      if (closed || character === '"') return fail(`Format tanda kutip tidak valid di baris data ${rows.length + 1}.`);
      field += character;
    }
  }
  if (quoted) return fail("Tanda kutip CSV belum ditutup.");
  if (field || row.length || closed) finishRow();
  const header = rows.shift()?.map((value) => value.trim());
  if (!header || header.join(",") !== "guestName,guestQuota") return fail("Header CSV harus guestName,guestQuota (tanpa kolom kode).");
  if (!rows.length) return fail("CSV belum berisi tamu.");
  if (rows.length > MAX_CSV_ROWS) return fail("Maksimal 500 tamu per impor.");
  const guests: CsvGuest[] = [], errors: string[] = [];
  rows.forEach((values, index) => {
    const result = guestSchema.safeParse({ guestName: values[0], guestQuota: /^\d+$/.test(values[1]?.trim() ?? "") ? Number(values[1]) : NaN });
    if (values.length !== 2) errors.push(`Baris ${index + 2}: harus berisi dua kolom.`);
    else if (!result.success) errors.push(`Baris ${index + 2}: ${result.error.issues.map(({ message }) => message).join(" ")}`);
    else guests.push(result.data);
  });
  return { guests, errors };
}
