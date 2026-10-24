import "server-only";
import { prisma } from "@/lib/prisma";
import { bootstrapSchema } from "./validation";
import { hashPassword } from "./password";

export async function bootstrapSuperAdmin(input: unknown) {
  const data = bootstrapSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    // Serialize bootstrap calls without changing or locking existing application data.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(827364912)`;
    const matches = await tx.user.findMany({ where: { email: { equals: data.email, mode: "insensitive" } }, select: { role: true }, take: 2 });
    if (matches.length) {
      if (matches.length !== 1 || matches[0].role !== "SUPER_ADMIN") throw new Error("BOOTSTRAP_EMAIL_CONFLICT");
      return "exists" as const;
    }
    if (await tx.user.count({ where: { role: "SUPER_ADMIN" } })) return "exists" as const;
    await tx.user.create({ data: { name: data.name, email: data.email, passwordHash, role: "SUPER_ADMIN" } });
    return "created" as const;
  });
}
