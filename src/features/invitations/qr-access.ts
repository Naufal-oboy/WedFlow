import "server-only";
import { z } from "zod";
import { AccessError, requireApiUser } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { prisma } from "@/lib/prisma";
import { qrCodeSchema } from "./qr";

export async function getQrInvitation(eventId: string, invitationId: string) {
  const user = await requireApiUser(["SUPER_ADMIN"]);
  const ids = z.object({ eventId: z.uuid(), invitationId: z.uuid() }).parse({ eventId, invitationId });
  const invitation = await prisma.invitation.findFirst({
    where: { id: ids.invitationId, eventId: ids.eventId, event: eventScope(user) },
    select: {
      id: true, code: true, guestName: true, guestQuota: true,
      checkedInAt: true, checkedInCount: true,
      event: { select: { id: true, name: true, eventDate: true, location: true } },
    },
  });
  if (!invitation) throw new AccessError(404, "Undangan tidak ditemukan pada acara ini.");
  // Never silently rotate old codes or encode potentially personal legacy values.
  if (!qrCodeSchema.safeParse(invitation.code).success) {
    throw new AccessError(409, "Kode undangan lama belum memenuhi format QR aman. Hubungi administrator untuk peninjauan kode; kode lama tidak diubah.");
  }
  return invitation;
}
