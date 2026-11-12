import "server-only";
import { z } from "zod";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AccessError } from "@/lib/access-error";
import { eventScope } from "@/features/events/scope";
import { attendanceMetrics, fillTimeline, timelineInterval, type AttendanceSnapshot } from "./model";

export async function attendanceEvent(tx: Prisma.TransactionClient, user: Session["user"], eventId: string, exporting = false) {
  if (exporting && user.role !== "SUPER_ADMIN" && user.role !== "CLIENT") throw new AccessError(403, "Ekspor hanya tersedia untuk admin dan client pemilik acara.");
  z.uuid().parse(eventId);
  const event = await tx.event.findFirst({ where: { AND: [{ id: eventId }, eventScope(user)] }, select: { id: true, name: true, slug: true, eventDate: true, status: true, timeZone: true } });
  if (!event) throw new AccessError(404, "Acara tidak ditemukan.");
  return event;
}

export async function attendanceSnapshot(user: Session["user"], eventId: string): Promise<AttendanceSnapshot> {
  return prisma.$transaction(async tx => {
    const event = await attendanceEvent(tx, user, eventId);
    const invitations = await tx.invitation.aggregate({ where: { eventId }, _count: true, _sum: { guestQuota: true } });
    const [totals] = await tx.$queryRaw<{ attendees: number; arrived: number; first: Date | null; latest: Date | null }[]>`
      SELECT COALESCE(SUM(l."count"), 0)::float8 AS attendees,
        COUNT(DISTINCT l."invitationId")::int AS arrived,
        MIN(l."createdAt") AS first, MAX(l."createdAt") AS latest
      FROM "CheckinLog" l JOIN "Invitation" i ON i.id = l."invitationId" AND i."eventId" = l."eventId"
      WHERE l."eventId" = ${eventId}`;
    const activity = await tx.checkinLog.findMany({
      where: { eventId, invitation: { eventId } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
      select: { id: true, count: true, method: true, legacy: true, createdAt: true, invitation: { select: { guestName: true } }, ...(user.role !== "CLIENT" && { user: { select: { name: true } } }) },
    });
    const intervalMinutes = totals.first && totals.latest ? timelineInterval(totals.first, totals.latest) : 15;
    const seconds = intervalMinutes * 60;
    const rows = totals.first ? await tx.$queryRaw<{ start: Date; count: number }[]>`
      SELECT to_timestamp(floor(extract(epoch FROM l."createdAt" AT TIME ZONE 'UTC') / ${seconds}) * ${seconds}) AS start,
        SUM(l."count")::float8 AS count
      FROM "CheckinLog" l JOIN "Invitation" i ON i.id = l."invitationId" AND i."eventId" = l."eventId"
      WHERE l."eventId" = ${eventId} GROUP BY 1 ORDER BY 1` : [];
    return {
      event: { name: event.name, status: event.status, timeZone: event.timeZone },
      summary: attendanceMetrics(invitations._count, invitations._sum.guestQuota ?? 0, totals.attendees, totals.arrived, totals.latest),
      activity: activity.map(row => ({ id: row.id, guestName: row.invitation.guestName, count: row.count, method: row.method, legacy: row.legacy, createdAt: row.createdAt.toISOString(), staffName: user.role !== "CLIENT" && "user" in row ? (row.user as { name: string } | null)?.name ?? null : null })),
      timeline: { intervalMinutes, buckets: fillTimeline(rows, intervalMinutes) },
      refreshedAt: new Date().toISOString(),
    };
  }, { isolationLevel: "RepeatableRead", timeout: 10_000 });
}
