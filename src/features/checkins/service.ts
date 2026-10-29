import "server-only";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AccessError, requireApiUser } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { qrCodeSchema } from "@/features/invitations/qr";
import { createVerification, readVerification } from "./verification";
import { checkinRateLimit } from "./rate-limit";
import type { ArrivalInput, VerifyInput } from "./validation";

export const checkinGuestSelect = { id: true, guestName: true, guestQuota: true, checkedInAt: true, checkedInCount: true } satisfies Prisma.InvitationSelect;
const logSelect = {
  id: true, count: true, method: true, createdAt: true, legacy: true,
  invitation: { select: { guestName: true } }, user: { select: { name: true } },
} satisfies Prisma.CheckinLogSelect;
type Guest = Prisma.InvitationGetPayload<{ select: typeof checkinGuestSelect }>;

export async function checkinUser() {
  const user = await requireApiUser(["SUPER_ADMIN", "STAFF"]);
  checkinRateLimit(user.id);
  return user;
}
async function accessibleEvent(db: Prisma.TransactionClient, user: Session["user"], eventId: string) {
  const event = await db.event.findFirst({ where: { AND: [{ id: eventId }, eventScope(user)] }, select: { id: true, name: true, status: true, client: { select: { status: true } } } });
  if (!event) throw new AccessError(404, "Acara tidak ditemukan atau Anda belum ditugaskan.");
  return event;
}

export async function searchInvitations(user: Session["user"], eventId: string, query: string) {
  return prisma.$transaction(async (tx) => {
    await accessibleEvent(tx, user, eventId);
    // Indexed trigram candidates; never load the entire guest list into Node.
    // Escape LIKE metacharacters so a query remains a literal partial name.
    const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    const invitations = await tx.$queryRaw<Guest[]>`
      SELECT "id", "guestName", "guestQuota", "checkedInAt", "checkedInCount"
      FROM "Invitation"
      WHERE "eventId" = ${eventId}
        AND (lower("guestName") LIKE ${pattern} OR lower("guestName") % lower(${query})
          OR lower(${query}) <% lower("guestName"))
      ORDER BY (lower("guestName") = lower(${query})) DESC,
        (lower("guestName") LIKE ${pattern}) DESC,
        GREATEST(similarity(lower("guestName"), lower(${query})), word_similarity(lower(${query}), lower("guestName"))) DESC,
        "guestName", "id"
      LIMIT 20`;
    return { invitations };
  }, { isolationLevel: "RepeatableRead" });
}

export async function verifyInvitation(user: Session["user"], input: VerifyInput) {
  const event = await accessibleEvent(prisma, user, input.eventId);
  if (event.status !== "ACTIVE" || event.client.status !== "ACTIVE") throw new AccessError(409, "Check-in hanya tersedia untuk acara dan client aktif.");
  if (input.method === "QR" && !qrCodeSchema.safeParse(input.code).success) throw new AccessError(400, "QR tidak valid. Pindai QR undangan WedFlow atau gunakan kode manual.");
  const invitation = await prisma.invitation.findFirst({
    where: { eventId: input.eventId, ...(input.method === "NAME_SEARCH" ? { id: input.invitationId } : { code: input.code }) }, select: checkinGuestSelect,
  });
  if (!invitation) throw new AccessError(404, "Undangan tidak ditemukan pada acara ini. Periksa kode dan acara yang dipilih.");
  return {
    event: { id: event.id, name: event.name }, invitation,
    verificationToken: createVerification({ eventId: event.id, invitationId: invitation.id, userId: user.id, method: input.method, count: invitation.checkedInCount ?? 0, quota: invitation.guestQuota, name: invitation.guestName }),
  };
}

export async function invitationDetail(user: Session["user"], eventId: string, invitationId: string) {
  await accessibleEvent(prisma, user, eventId);
  const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, eventId }, select: checkinGuestSelect });
  if (!invitation) throw new AccessError(404, "Undangan tidak ditemukan pada acara ini.");
  return { invitation };
}

export async function checkinHistory(user: Session["user"], eventId: string, invitationId?: string, cursor?: string) {
  await accessibleEvent(prisma, user, eventId);
  const anchor = cursor ? await prisma.checkinLog.findFirst({ where: { id: cursor, eventId, ...(invitationId && { invitationId }) }, select: { id: true, createdAt: true } }) : null;
  if (cursor && !anchor) throw new AccessError(400, "Cursor riwayat tidak valid.");
  const rows = await prisma.checkinLog.findMany({
    where: { eventId, ...(invitationId && { invitationId }), ...(anchor && { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] }) },
    select: logSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
  });
  return { arrivals: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
}

export async function recordArrival(user: Session["user"], input: ArrivalInput) {
  const claims = readVerification(input.verificationToken, input.eventId, user.id);
  return prisma.$transaction(async (tx) => {
    // Lock access records through commit so status/assignment revocation cannot
    // overtake an authorized write. All arrivals use the same lock order.
    await tx.$queryRaw`SELECT e."id" FROM "Event" e JOIN "Client" c ON c."id" = e."clientId"
      WHERE e."id" = ${input.eventId} FOR SHARE OF e, c`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR SHARE`;
    if (user.role === "STAFF") await tx.$queryRaw`SELECT "eventId" FROM "EventStaff" WHERE "eventId" = ${input.eventId} AND "userId" = ${user.id} FOR SHARE`;
    const currentUser = await tx.user.findUnique({ where: { id: user.id }, select: { role: true } });
    if (!currentUser || currentUser.role !== user.role) throw new AccessError(403, "Akses petugas berubah. Silakan login kembali.");
    const event = await accessibleEvent(tx, user, input.eventId);
    const rows = await tx.$queryRaw<Guest[]>`SELECT "id", "guestName", "guestQuota", "checkedInCount", "checkedInAt"
      FROM "Invitation" WHERE "id" = ${claims.invitationId} AND "eventId" = ${input.eventId} FOR UPDATE`;
    const invitation = rows[0];
    if (!invitation) throw new AccessError(404, "Undangan tidak ditemukan pada acara ini.");
    const previous = await tx.checkinLog.findUnique({ where: { id: claims.id } });
    if (previous) {
      if (previous.userId !== user.id || previous.eventId !== input.eventId || previous.invitationId !== invitation.id || previous.count !== input.count || previous.method !== claims.method) throw new AccessError(409, "Verifikasi ini sudah digunakan dengan data berbeda.");
      return { success: true, replayed: true, invitation, arrival: await tx.checkinLog.findUniqueOrThrow({ where: { id: previous.id }, select: logSelect }) };
    }
    if (event.status !== "ACTIVE" || event.client.status !== "ACTIVE") throw new AccessError(409, "Acara atau client tidak aktif.");
    if (claims.expires <= Date.now()) throw new AccessError(409, "Verifikasi kedaluwarsa. Verifikasi undangan kembali.");
    if ((invitation.checkedInCount ?? 0) !== claims.count || invitation.guestQuota !== claims.quota || invitation.guestName !== claims.name) throw new AccessError(409, "Data undangan berubah. Verifikasi kembali jumlah hadir dan sisa kuota.");
    const changed = await tx.$executeRaw`UPDATE "Invitation"
      SET "checkedInCount" = COALESCE("checkedInCount", 0) + ${input.count},
        "checkedInAt" = COALESCE("checkedInAt", CURRENT_TIMESTAMP),
        "checkedInById" = CASE WHEN "checkedInAt" IS NULL THEN ${user.id} ELSE "checkedInById" END
      WHERE "id" = ${invitation.id} AND "eventId" = ${input.eventId}
        AND COALESCE("checkedInCount", 0) + ${input.count} <= "guestQuota"`;
    if (!changed) throw new AccessError(409, "Jumlah kedatangan melebihi sisa kuota undangan.");
    const arrival = await tx.checkinLog.create({ data: { id: claims.id, eventId: input.eventId, invitationId: invitation.id, userId: user.id, count: input.count, method: claims.method }, select: logSelect });
    return { success: true, replayed: false, arrival, invitation: await tx.invitation.findUniqueOrThrow({ where: { id: invitation.id }, select: checkinGuestSelect }) };
  }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
}
