import { z } from "zod";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { guestSchema } from "@/features/invitations/guest-validation";
import { generateInvitationCode } from "@/features/invitations/qr";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => {
    const user = await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const eventId = z.uuid().parse((await context.params).eventId);
    const data = guestSchema.parse(await request.json());
    if (!await prisma.event.findFirst({ where: { AND: [{ id: eventId }, eventScope(user)] }, select: { id: true } })) throw new AccessError(404, "Acara tidak ditemukan.");
    const invitation = await prisma.invitation.create({ data: { ...data, eventId, code: generateInvitationCode() }, select: { id: true, guestName: true, guestQuota: true } });
    return apiJson({ invitation }, 201);
  });
}
