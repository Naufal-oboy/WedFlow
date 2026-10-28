import { z } from "zod";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { guestSchema } from "@/features/invitations/guest-validation";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string; invitationId: string }> }) {
  return apiHandler(async () => {
    const user = await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { eventId, invitationId } = z.object({ eventId: z.uuid(), invitationId: z.uuid() }).parse(await context.params);
    const data = guestSchema.parse(await request.json());
    const where = { id: invitationId, eventId, event: eventScope(user) };
    if (!await prisma.invitation.findFirst({ where, select: { id: true } })) throw new AccessError(404, "Undangan tidak ditemukan.");
    // One conditional statement also prevents an edit racing with check-in.
    const updated = await prisma.invitation.updateMany({ where: { ...where, checkedInAt: null }, data });
    if (!updated.count) throw new AccessError(409, "Undangan sudah check-in atau data berubah. Muat ulang daftar tamu.");
    return apiJson({ success: true });
  });
}
