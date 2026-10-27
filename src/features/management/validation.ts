import { z } from "zod";

export const clientTypes = { COUPLE: "Pasangan", WEDDING_ORGANIZER: "Wedding organizer" } as const;
export const clientStatuses = { ACTIVE: "Aktif", INACTIVE: "Nonaktif" } as const;
export const eventStatuses = { DRAFT: "Draft", ACTIVE: "Aktif", COMPLETED: "Selesai", CANCELLED: "Dibatalkan" } as const;

const optionalEmail = z.union([z.email("Format email tidak valid.").max(254), z.literal("")]).transform((v) => v || null);
export const clientSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120),
  email: z.string().trim().toLowerCase().pipe(optionalEmail),
  phone: z.string().trim().max(30).refine((v) => !v || /^[+\d\s().-]{6,30}$/.test(v), "Nomor telepon tidak valid.").transform((v) => v || null),
  type: z.enum(["COUPLE", "WEDDING_ORGANIZER"]),
});
export const clientStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });
export const dateSchema = z.iso.date("Tanggal tidak valid.").refine((v) => v >= "1900-01-01" && v <= "9999-12-31", "Tanggal di luar rentang.");
export const eventSchema = z.object({
  clientId: z.uuid("Pilih client yang valid."),
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(160),
  slug: z.string().trim().min(3, "Slug minimal 3 karakter.").max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Gunakan huruf kecil, angka, dan tanda hubung untuk slug."),
  date: dateSchema,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Waktu tidak valid."),
  location: z.string().trim().min(2, "Lokasi wajib diisi.").max(300),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]),
});

export type SearchParams = Record<string, string | string[] | undefined>;
export function single(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}
const optionalDate = z.union([dateSchema, z.literal("")]).optional();
export const listSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  status: z.enum(["", "ACTIVE", "INACTIVE", "DRAFT", "COMPLETED", "CANCELLED"]).optional().default(""),
  type: z.enum(["", "COUPLE", "WEDDING_ORGANIZER"]).optional().default(""),
  clientId: z.union([z.uuid(), z.literal("")]).optional().default(""),
  from: optionalDate,
  to: optionalDate,
}).refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Tanggal akhir harus sama atau setelah tanggal awal.", path: ["to"] });
export function parseFilters(params: SearchParams) {
  return listSchema.safeParse(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
}
export function eventDateTime(date: string, time = "00:00") {
  return new Date(`${date}T${time}:00+07:00`);
}
export function localEventInputs(date: Date) {
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
export function formatEventDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date) + " WIB";
}
export function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "");
}
