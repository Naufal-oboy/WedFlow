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
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { client: { select: { status: true } } } });
      if (!event) throw new AccessError(404, "Acara tidak ditemukan.");
      const existing = await tx.eventStaff.findMany({ where: { eventId }, select: { userId: true } });
      const additions = userIds.filter((id) => !existing.some((assignment) => assignment.userId === id));
      if (event.client.status !== "ACTIVE" && additions.length) throw new AccessError(409, "Aktifkan client sebelum menambahkan penugasan.");
      if (await tx.user.count({ where: { id: { in: userIds }, role: "STAFF" } }) !== userIds.length) throw new AccessError(400, "Penugasan hanya untuk akun STAFF.");
      await tx.eventStaff.deleteMany({ where: { eventId, userId: { notIn: userIds } } });
      await tx.eventStaff.createMany({ data: additions.map((userId) => ({ eventId, userId })) });
    }, { isolationLevel: "Serializable" });
    return apiJson({ success: true });
  });
}
