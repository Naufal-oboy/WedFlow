import type { DefaultSession } from "next-auth";
import type {} from "@auth/core/jwt";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface User { role: Role; clientId: string | null; version?: string }
  interface Session {
    user: DefaultSession["user"] & { id: string; role: Role; clientId: string | null };
  }
}
declare module "@auth/core/jwt" {
  interface JWT { role?: Role; clientId?: string | null; version?: string }
}
