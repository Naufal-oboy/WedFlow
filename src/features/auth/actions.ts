"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { loginSchema, type LoginState } from "./validation";

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fields: parsed.error.flatten().fieldErrors };
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Login gagal. Periksa email dan password, atau coba lagi nanti." };
    throw error; // Preserve Next.js redirect control flow.
  }
  return {};
}

export async function logoutAction() { await signOut({ redirectTo: "/login" }); }
