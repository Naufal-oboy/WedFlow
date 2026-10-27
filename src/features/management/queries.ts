import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/features/auth/access";
import { eventDateTime, listSchema } from "./validation";
import type { z } from "zod";

export const PAGE_SIZE = 12;
type Filters = z.infer<typeof listSchema>;
export async function listClients(filters: Filters) {
  await requireApiUser(["SUPER_ADMIN"]);
  const where: Prisma.ClientWhereInput = {
    ...(filters.q && { OR: ["name", "email", "phone"].map((field) => ({ [field]: { contains: filters.q, mode: "insensitive" } })) }),
    ...(filters.status === "ACTIVE" || filters.status === "INACTIVE" ? { status: filters.status } : {}),
    ...(filters.type && { type: filters.type }),
  };
  const total = await prisma.client.count({ where });
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const clients = await prisma.client.findMany({ where, include: { _count: { select: { events: true, users: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { clients, total, page };
}
export async function listAdminEvents(filters: Filters) {
  await requireApiUser(["SUPER_ADMIN"]);
  const where: Prisma.EventWhereInput = {
    ...(filters.q && { OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { slug: { contains: filters.q, mode: "insensitive" } }] }),
    ...(filters.clientId && { clientId: filters.clientId }),
    ...(filters.status && { status: filters.status }),
    ...((filters.from || filters.to) && { eventDate: {
      ...(filters.from && { gte: eventDateTime(filters.from) }),
      ...(filters.to && { lt: new Date(eventDateTime(filters.to).getTime() + 86400000) }),
    } }),
  };
  const total = await prisma.event.count({ where });
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const events = await prisma.event.findMany({ where, include: { client: { select: { id: true, name: true, status: true } }, _count: { select: { staffAssignments: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { events, total, page };
}
