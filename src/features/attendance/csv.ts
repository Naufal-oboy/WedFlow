// Quote every cell and neutralize spreadsheet formulas, including leading whitespace.
export function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function csvRow(values: unknown[]) { return values.map(csvCell).join(",") + "\r\n"; }
export function attendanceStatus(count: number, quota: number) { return count === 0 ? "Belum hadir" : count < quota ? "Hadir sebagian" : "Hadir penuh"; }
export function attendanceFilename(slug: string, now: Date) {
  return `wedflow-attendance-${slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 100)}-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.csv`;
}
