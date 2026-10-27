import { guestSchema, MAX_CSV_BYTES, MAX_CSV_ROWS, type GuestInput } from "./validation";

export type PreviewRow = {
  line: number;
  guestName: string;
  guestQuota: string;
  errors: string[];
  duplicate: boolean;
  data?: GuestInput;
};
export type CsvPreview = { rows: PreviewRow[]; valid: number; invalid: number; duplicates: number };
export class CsvError extends Error {}

// Strict comma-separated CSV with quoted fields, escaped quotes and physical line numbers.
function records(text: string) {
  const result: { line: number; cells: string[] }[] = [];
  let cells: string[] = [], field = "", quoted = false, closed = false;
  let line = 1, start = 1;
  function cell() { cells.push(field); field = ""; closed = false; }
  function record() {
    cell();
    if (cells.length > 1 || cells.some((value) => value.trim() !== "")) result.push({ line: start, cells });
    if (result.length > MAX_CSV_ROWS + 1) throw new CsvError(`Maksimal ${MAX_CSV_ROWS} baris data.`);
    cells = [];
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        field += "\n"; line++;
      } else field += char;
    } else if (char === ",") cell();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record(); line++; start = line;
    } else if (char === '"' && field === "" && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new CsvError(`Format kutip tidak valid pada baris ${line}.`);
      field += char;
    }
  }
  if (quoted) throw new CsvError(`Kutip belum ditutup pada baris ${start}.`);
  if (field || closed || cells.length) record();
  return result;
}

export function parseGuestCsv(csv: string): CsvPreview {
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) throw new CsvError("Ukuran CSV maksimal 256 KiB.");
  if (csv.includes("\ufffd") || csv.includes("\u0000")) throw new CsvError("Gunakan file CSV dengan encoding UTF-8 yang valid.");
  const parsed = records(csv.replace(/^\ufeff/u, ""));
  const header = parsed.shift()?.cells.map((value) => value.trim());
  if (!header || header.length !== 2 || new Set(header).size !== 2 || !header.includes("guestName") || !header.includes("guestQuota")) {
    throw new CsvError("Header wajib guestName,guestQuota (pemisah koma, tanpa kolom tambahan).");
  }
  if (!parsed.length) throw new CsvError("CSV belum memiliki baris tamu.");
  const names = new Map<string, number>();
  const rows = parsed.map(({ line, cells }): PreviewRow => {
    const guestName = cells[header.indexOf("guestName")] ?? "";
    const guestQuota = cells[header.indexOf("guestQuota")]?.trim() ?? "";
    const result = guestSchema.safeParse({ guestName, guestQuota: /^\d+$/u.test(guestQuota) ? Number(guestQuota) : NaN });
    const errors = cells.length === 2 ? [] : ["Jumlah kolom harus tepat 2."];
    if (!result.success) errors.push(...result.error.issues.map((issue) => issue.path[0] === "guestQuota" ? "Kuota harus bilangan bulat 1–1000." : issue.message));
    const data = result.success && !errors.length ? result.data : undefined;
    if (data) names.set(data.guestName.toLowerCase(), (names.get(data.guestName.toLowerCase()) ?? 0) + 1);
    return { line, guestName: data?.guestName ?? guestName, guestQuota, errors, duplicate: false, data };
  });
  for (const row of rows) row.duplicate = !!row.data && (names.get(row.data.guestName.toLowerCase()) ?? 0) > 1;
  const valid = rows.filter((row) => row.data).length;
  return { rows, valid, invalid: rows.length - valid, duplicates: rows.filter((row) => row.duplicate).length };
}

// Preview is rendered as React text, never interpreted as HTML or spreadsheet content.
export function safePreviewCell(value: string) {
  return /^[\s]*[=+\-@]/u.test(value) ? `'${value}` : value;
}
