import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";

export function eventScope(user: Session["user"]): Prisma.EventWhereInput {
  switch (user.role) {
    case "SUPER_ADMIN": return {};
    case "CLIENT": return user.clientId ? { clientId: user.clientId } : { id: { in: [] } };
    case "STAFF": return { staffAssignments: { some: { userId: user.id } } };
    default: return { id: { in: [] } };
  }
}

export const eventSelect = {
  id: true, name: true, slug: true, eventDate: true, location: true, status: true,
  client: { select: { name: true } },
  _count: { select: { invitations: true } },
} satisfies Prisma.EventSelect;
