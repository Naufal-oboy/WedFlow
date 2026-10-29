import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { readGuestJson } from "@/features/guests/request";
import { confirmSchema } from "@/features/checkins/validation";
import { checkinUser, recordArrival } from "@/features/checkins/service";

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
    const user = await checkinUser();
    requireSameOrigin(request);
    const result = await recordArrival(user, confirmSchema.parse(await readGuestJson(request)));
    return apiJson(result, result.replayed ? 200 : 201);
  });
}
