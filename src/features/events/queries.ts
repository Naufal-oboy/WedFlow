import "server-only";
import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { eventScope, eventSelect } from "./scope";

export async function listAccessibleEvents() {
  const user = await requireApiUser();
  return prisma.event.findMany({ where: eventScope(user), select: eventSelect, orderBy: { eventDate: "asc" }, take: 100 });
}
export async function getAccessibleEvent(id: string) {
  const user = await requireApiUser();
  const event = await prisma.event.findFirst({ where: { AND: [{ id }, eventScope(user)] }, select: eventSelect });
  if (!event) throw new AccessError(404, "Acara tidak ditemukan.");
  return event;
}
