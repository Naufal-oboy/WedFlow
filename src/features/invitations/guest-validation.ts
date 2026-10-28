import { z } from "zod";

export const guestSchema = z.object({
  guestName: z.string().trim().min(1, "Nama tamu wajib diisi.").max(160, "Nama maksimal 160 karakter."),
  guestQuota: z.number().int().min(1, "Kuota minimal 1.").max(1000, "Kuota maksimal 1000."),
}).strict();

export const guestListSchema = z.object({
  q: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export const MAX_CSV_BYTES = 256 * 1024;
export const MAX_CSV_ROWS = 500;
