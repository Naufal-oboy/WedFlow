import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { eventSchema, eventDateTime } from "@/features/management/validation";

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { eventId } = await context.params;
    const { date, time, ...data } = eventSchema.parse(await request.json());
    const event = await prisma.$transaction(async (tx) => {
      const target = await tx.event.findUnique({ where: { id: eventId }, select: { clientId: true } });
      if (!target) throw new AccessError(404, "Acara tidak ditemukan.");
      if (target.clientId !== data.clientId) throw new AccessError(409, "Pemilik acara tidak dapat dipindahkan ke client lain.");
      return tx.event.update({ where: { id: eventId }, data: { ...data, eventDate: eventDateTime(date, time) } });
    });
    return apiJson({ event });
  });
}
