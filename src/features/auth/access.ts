import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Role } from "@/generated/prisma/enums";
import { auth } from "@/auth";
import { roleHome } from "./roles";

export const getCurrentUser = cache(async () => {
  // Auth.js uses cryptographic randomness. Keep it outside speculative prerenders.
  await connection();
  return (await auth())?.user ?? null;
});

export async function requirePageRole(role: Role) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(roleHome[user.role]);
  return user;
}

export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireApiUser(roles?: readonly Role[]) {
  const user = await getCurrentUser();
  if (!user) throw new AccessError(401, "Silakan login terlebih dahulu.");
  if (roles && !roles.includes(user.role)) throw new AccessError(403, "Akses ditolak.");
  return user;
}
