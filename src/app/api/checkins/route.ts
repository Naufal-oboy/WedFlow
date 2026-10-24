import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";

const checkinSchema = z.object({ eventId: z.string().uuid(), code: z.string().min(1).max(200), count: z.number().int().min(1).max(1000) });

export async function GET(request: Request) {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const eventId = z.string().uuid().parse(new URL(request.url).searchParams.get("eventId"));
    const scope = { AND: [{ id: eventId }, eventScope(user)] };
    if (!await prisma.event.findFirst({ where: scope, select: { id: true } })) throw new AccessError(404, "Acara tidak ditemukan.");
    const invitations = await prisma.invitation.findMany({
      where: { event: scope },
      select: { id: true, guestName: true, guestQuota: true, checkedInAt: true, checkedInCount: true },
      orderBy: { guestName: "asc" }, take: 200,
    });
    return apiJson({ invitations });
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    const user = await requireApiUser(["SUPER_ADMIN", "STAFF"]);
    requireSameOrigin(request);
    const input = checkinSchema.parse(await request.json());
    const where = { code: input.code, eventId: input.eventId, event: eventScope(user) };
    const invitation = await prisma.invitation.findFirst({ where, select: { id: true, guestQuota: true } });
    if (!invitation) throw new AccessError(404, "Undangan tidak ditemukan.");
    if (input.count > invitation.guestQuota) throw new AccessError(400, "Jumlah tamu melebihi kuota undangan.");
    // The conditional update prevents two staff requests checking in the same invitation twice.
    const result = await prisma.invitation.updateMany({
      where: { ...where, id: invitation.id, checkedInAt: null, guestQuota: { gte: input.count } },
      data: { checkedInAt: new Date(), checkedInById: user.id, checkedInCount: input.count },
    });
    if (!result.count) throw new AccessError(409, "Undangan sudah check-in atau akses berubah.");
    return apiJson({ success: true }, 201);
  });
}
