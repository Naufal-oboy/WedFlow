import { notFound } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/features/auth/access";
import { eventScope, eventSelect } from "@/features/events/scope";
import { prisma } from "@/lib/prisma";
import { CheckinForm } from "@/features/checkins/checkin-form";
import { StaffAssignmentForm } from "@/features/events/staff-assignment-form";

export async function EventDetail({ role, params }: { role: Role; params: Promise<{ eventId: string }> }) {
  const user = await requirePageRole(role);
  const { eventId } = await params;
  const scope = { AND: [{ id: eventId }, eventScope(user)] };
  const event = await prisma.event.findFirst({ where: scope, select: eventSelect });
  if (!event) notFound();
  const [attendance, guests] = await Promise.all([
    prisma.invitation.aggregate({ where: { event: scope, checkedInAt: { not: null } }, _sum: { checkedInCount: true } }),
    prisma.invitation.findMany({ where: { event: scope }, select: { id: true, guestName: true, guestQuota: true, checkedInAt: true, checkedInCount: true }, take: 100, orderBy: { guestName: "asc" } }),
  ]);
  const assignment = role === "SUPER_ADMIN" ? await Promise.all([
    prisma.user.findMany({ where: { role: "STAFF" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.eventStaff.findMany({ where: { eventId }, select: { userId: true } }),
  ]) : null;
  return <div className="max-w-4xl space-y-6"><div><p className="text-sm text-stone-500">{event.client.name}</p><h1 className="mt-2 text-3xl font-semibold text-emerald-950">{event.name}</h1><p className="mt-3 text-sm text-stone-500">{event.location || "Lokasi belum ditentukan"} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(event.eventDate)}</p></div>
    <div className="rounded-2xl bg-emerald-900 p-6 text-white"><p className="text-sm text-emerald-100">Laporan kehadiran</p><p className="mt-2 text-3xl font-semibold">{attendance._sum.checkedInCount ?? 0} <span className="text-base font-normal">tamu hadir</span></p><p className="mt-2 text-xs text-emerald-100">{event._count.invitations} undangan terdaftar</p></div>
    {assignment && <StaffAssignmentForm eventId={event.id} staff={assignment[0]} assignedIds={assignment[1].map(({ userId }) => userId)} />}
    {role !== "CLIENT" && <CheckinForm eventId={event.id} />}
    <section><h2 className="mb-4 font-semibold">Daftar tamu <span className="text-xs font-normal text-stone-500">(maksimal 100)</span></h2>{guests.length ? <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">{guests.map((guest) => <li key={guest.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span>{guest.guestName}</span><span className="text-stone-500">{guest.checkedInAt ? `${guest.checkedInCount} hadir` : `Belum hadir · kuota ${guest.guestQuota}`}</span></li>)}</ul> : <p className="text-sm text-stone-500">Belum ada undangan untuk acara ini.</p>}</section>
  </div>;
}
