import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";

export async function PUT(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { eventId } = await context.params;
    const { userIds } = z.object({ userIds: z.array(z.string().uuid()).max(100).transform((ids) => [...new Set(ids)]) }).parse(await request.json());
    await prisma.$transaction(async (tx) => {
      if (!await tx.event.findUnique({ where: { id: eventId }, select: { id: true } })) throw new AccessError(404, "Acara tidak ditemukan.");
      if (await tx.user.count({ where: { id: { in: userIds }, role: "STAFF" } }) !== userIds.length) throw new AccessError(400, "Penugasan hanya untuk akun STAFF.");
      await tx.eventStaff.deleteMany({ where: { eventId } });
      await tx.eventStaff.createMany({ data: userIds.map((userId) => ({ eventId, userId })) });
    });
    return apiJson({ success: true });
  });
}
