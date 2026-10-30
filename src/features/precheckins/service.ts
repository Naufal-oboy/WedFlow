import "server-only";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AccessError } from "@/lib/access-error";
import { accessibleEvent, searchInvitations, verifyInvitation } from "@/features/checkins/service";
import { createVerification } from "@/features/checkins/verification";
import { consumeLimit } from "./rate-limit";
import { hashTicket, newTicket, publicReceiptMessage, TICKET_TTL_MS } from "./ticket";

const ticketSelect = { id: true, queueCode: true, submittedName: true, status: true, createdAt: true, expiresAt: true } satisfies Prisma.PrecheckinRequestSelect;
export async function publicEvent(slug: string) {
  const event = await prisma.event.findFirst({ where: { slug, status: "ACTIVE", client: { status: "ACTIVE" } }, select: { id: true, name: true, slug: true } });
  if (!event) throw new AccessError(404, "Pre-check-in tidak tersedia. Silakan hubungi petugas acara.");
  return event;
}
export async function submitRequest(slug: string, name: string) {
  const event = await publicEvent(slug);
  await consumeLimit(`event:${event.id}`, 600);
  for (let attempt = 0; attempt < 3; attempt++) {
    const ticket = newTicket();
    try {
      const created = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT e."id" FROM "Event" e JOIN "Client" c ON c."id" = e."clientId" WHERE e."id" = ${event.id} FOR SHARE OF e,c`;
        if (!await tx.event.findFirst({ where: { id: event.id, slug, status: "ACTIVE", client: { status: "ACTIVE" } } })) throw new AccessError(404, "Pre-check-in tidak tersedia. Silakan hubungi petugas acara.");
        // All valid names follow exactly this path. Matching runs only when an
        // authorized operator opens the ticket; there is no public name oracle.
        return tx.precheckinRequest.create({ data: { eventId: event.id, submittedName: name, tokenHash: ticket.tokenHash, queueCode: ticket.queueCode, expiresAt: new Date(Date.now() + TICKET_TTL_MS) }, select: { expiresAt: true } });
      });
      return { message: publicReceiptMessage, token: ticket.token, queueCode: ticket.queueCode, expiresAt: created.expiresAt, status: "PENDING" as const };
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "P2002") || attempt === 2) throw error;
    }
  }
  throw new Error("Ticket allocation failed.");
}
export async function expireTickets(eventId: string) {
  await prisma.$executeRaw`UPDATE "PrecheckinRequest" SET "status" = 'EXPIRED'
    WHERE "eventId" = ${eventId} AND "status" = 'PENDING' AND "expiresAt" <= CURRENT_TIMESTAMP`;
}
export async function listTickets(user: Session["user"], eventId: string, status: "PENDING" | "VERIFIED" | "CANCELLED" | "EXPIRED", cursor?: string) {
  await accessibleEvent(prisma, user, eventId);
  await expireTickets(eventId);
  const anchor = cursor ? await prisma.precheckinRequest.findFirst({ where: { id: cursor, eventId, status }, select: { id: true, createdAt: true } }) : null;
  if (cursor && !anchor) throw new AccessError(400, "Antrean berubah. Muat ulang daftar.");
  const rows = await prisma.precheckinRequest.findMany({ where: { eventId, status, ...(anchor && { OR: [{ createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { gt: anchor.id } }] }) }, select: ticketSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 21 });
  return { requests: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
}
export async function openTicket(user: Session["user"], eventId: string, lookup: string) {
  await accessibleEvent(prisma, user, eventId);
  await expireTickets(eventId);
  const ticket = await prisma.precheckinRequest.findFirst({ where: { eventId, ...(lookup.startsWith("PCT-") ? { tokenHash: hashTicket(lookup) } : { queueCode: lookup.toUpperCase() }) }, select: ticketSelect });
  if (!ticket) throw new AccessError(404, "Tiket tidak ditemukan pada acara ini.");
  const candidates = ticket.status === "PENDING" ? (await searchInvitations(user, eventId, ticket.submittedName)).invitations : [];
  return { ticket, candidates };
}
export async function verifyTicket(user: Session["user"], eventId: string, requestId: string, invitationId: string) {
  await accessibleEvent(prisma, user, eventId);
  await expireTickets(eventId);
  const ticket = await prisma.precheckinRequest.findFirst({ where: { id: requestId, eventId, status: "PENDING", expiresAt: { gt: new Date() } }, select: ticketSelect });
  if (!ticket) throw new AccessError(409, "Tiket tidak tersedia atau sudah kedaluwarsa.");
  const result = await verifyInvitation(user, { eventId, method: "NAME_SEARCH", invitationId });
  return { ...result, ticket, verificationToken: createVerification({ eventId, invitationId, userId: user.id, method: "PUBLIC_PRECHECKIN", precheckinId: ticket.id, count: result.invitation.checkedInCount ?? 0, quota: result.invitation.guestQuota, name: result.invitation.guestName }) };
}
export async function cancelTicket(user: Session["user"], eventId: string, requestId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT e."id" FROM "Event" e JOIN "Client" c ON c."id" = e."clientId" WHERE e."id" = ${eventId} FOR SHARE OF e,c`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR SHARE`;
    if (user.role === "STAFF") await tx.$queryRaw`SELECT "eventId" FROM "EventStaff" WHERE "eventId" = ${eventId} AND "userId" = ${user.id} FOR SHARE`;
    if ((await tx.user.findUnique({ where: { id: user.id }, select: { role: true } }))?.role !== user.role) throw new AccessError(403, "Akses petugas berubah.");
    await accessibleEvent(tx, user, eventId);
    const changed = await tx.$executeRaw`UPDATE "PrecheckinRequest" SET "status" = 'CANCELLED', "cancelledAt" = clock_timestamp(), "processedById" = ${user.id}
      WHERE "id" = ${requestId} AND "eventId" = ${eventId} AND "status" = 'PENDING' AND "expiresAt" > clock_timestamp()`;
    if (!changed) throw new AccessError(409, "Tiket sudah diproses atau kedaluwarsa.");
    return { success: true };
  });
}
