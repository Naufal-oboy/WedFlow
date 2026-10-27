import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { clientStatusSchema } from "@/features/management/validation";

export async function PATCH(request: Request, context: { params: Promise<{ clientId: string }> }) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { clientId } = await context.params;
    const { status } = clientStatusSchema.parse(await request.json());
    const client = await prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({ where: { id: clientId }, data: { status } });
      // Invalidate old client sessions even if the client is later reactivated.
      await tx.user.updateMany({ where: { clientId, role: "CLIENT" }, data: { updatedAt: new Date() } });
      return updated;
    });
    return apiJson({ client });
  });
}
