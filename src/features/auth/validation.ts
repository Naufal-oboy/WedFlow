import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Masukkan email yang valid.").max(254);
const bcryptPassword = z.string().min(1, "Masukkan password.").max(72, "Password terlalu panjang.")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "Password maksimal 72 byte.");

export const loginSchema = z.object({ email: emailSchema, password: bcryptPassword });
export const newPasswordSchema = bcryptPassword.refine((value) => value.length >= 12, "Password minimal 12 karakter.");
export const bootstrapSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  name: z.string().trim().min(1).max(100).default("Super Admin"),
});

export type LoginState = {
  error?: string;
  fields?: { email?: string[]; password?: string[] };
};
