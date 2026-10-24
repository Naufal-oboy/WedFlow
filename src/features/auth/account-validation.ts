import { z } from "zod";
import { emailSchema, newPasswordSchema } from "./validation";

const accountFields = {
  name: z.string().trim().min(1).max(100),
  role: z.enum(["CLIENT", "STAFF"]),
  clientId: z.string().uuid().nullable().default(null),
};
const validClientLink = (data: { role: string; clientId: string | null }) => data.role === "CLIENT" ? !!data.clientId : data.clientId === null;
export const createAccountSchema = z.object({ ...accountFields, email: emailSchema, password: newPasswordSchema })
  .refine(validClientLink, "CLIENT wajib memiliki clientId; STAFF tidak boleh memiliki clientId.");
export const updateAccountSchema = z.object({ ...accountFields, password: newPasswordSchema.optional() })
  .refine(validClientLink, "CLIENT wajib memiliki clientId; STAFF tidak boleh memiliki clientId.");
