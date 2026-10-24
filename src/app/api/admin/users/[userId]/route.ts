import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { updateAccountSchema } from "@/features/auth/account-validation";
import { safeUserSelect } from "@/features/auth/user-select";
import { hashPassword } from "@/features/auth/password";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { userId } = await context.params;
    const { password, ...data } = updateAccountSchema.parse(await request.json());
    const passwordHash = password ? await hashPassword(password) : undefined;
    const user = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!target) throw new AccessError(404, "Akun tidak ditemukan.");
      if (target.role === "SUPER_ADMIN") throw new AccessError(403, "Akun Super Admin tidak dapat diubah melalui endpoint ini.");
      if (data.role !== "STAFF") await tx.eventStaff.deleteMany({ where: { userId } });
      return tx.user.update({ where: { id: userId }, data: { ...data, passwordHash }, select: safeUserSelect });
    });
    return apiJson({ user });
  });
}
