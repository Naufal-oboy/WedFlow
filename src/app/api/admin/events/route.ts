import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { eventSchema, eventDateTime, listSchema } from "@/features/management/validation";
import { listAdminEvents } from "@/features/management/queries";

export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    return apiJson(await listAdminEvents(listSchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { date, time, ...data } = eventSchema.parse(await request.json());
    const event = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: data.clientId }, select: { status: true } });
      if (!client) throw new AccessError(404, "Client tidak ditemukan.");
      if (client.status !== "ACTIVE") throw new AccessError(409, "Aktifkan client sebelum membuat acara.");
      return tx.event.create({ data: { ...data, eventDate: eventDateTime(date, time) } });
    }, { isolationLevel: "Serializable" });
    return apiJson({ event }, 201);
  });
}
