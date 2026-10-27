import { z } from "zod";

export const MAX_CSV_BYTES = 256 * 1024;
export const MAX_CSV_ROWS = 500;
export const GUEST_PAGE_SIZE = 20;
export const guestSchema = z.object({
  guestName: z.string().max(500, "Nama terlalu panjang.")
    .transform((value) => value.normalize("NFC").trim().replace(/\s+/gu, " "))
    .pipe(z.string().min(1, "Nama tamu wajib diisi.").max(150, "Nama maksimal 150 karakter.")
      .refine((value) => !/^[=+\-@]/u.test(value), "Nama tidak boleh diawali =, +, -, atau @.")
      .refine((value) => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value), "Nama mengandung karakter kontrol.")),
  guestQuota: z.number().int("Kuota harus bilangan bulat.").min(1, "Kuota minimal 1.").max(1000, "Kuota maksimal 1000."),
}).strict();
export const guestFiltersSchema = z.object({
  q: z.string().trim().max(150).default(""),
  attendance: z.enum(["", "present", "absent"]).default(""),
  sort: z.enum(["name_asc", "name_desc", "created_asc", "created_desc"]).default("created_desc"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const guestParamsSchema = z.object({ eventId: z.uuid(), guestId: z.uuid().optional() });
export const importSchema = z.object({
  csv: z.string().min(1).max(MAX_CSV_BYTES),
  mode: z.enum(["preview", "confirm"]),
  token: z.string().max(2000).optional(),
  allowDuplicateNames: z.boolean().default(false),
}).strict();
export type GuestInput = z.infer<typeof guestSchema>;
export type GuestFilters = z.infer<typeof guestFiltersSchema>;
