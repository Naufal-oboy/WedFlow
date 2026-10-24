import "server-only";
import { hash } from "bcryptjs";
import { newPasswordSchema } from "./validation";

export async function hashPassword(password: string) {
  return hash(newPasswordSchema.parse(password), 12);
}
