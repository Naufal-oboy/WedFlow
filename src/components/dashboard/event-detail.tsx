import { notFound } from "next/navigation";
import Link from "next/link";
import { StatusBadge, linkButton } from "./management-ui";
import { formatEventDate } from "@/features/management/validation";
import type { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/features/auth/access";
import { eventScope, eventSelect } from "@/features/events/scope";
import { prisma } from "@/lib/prisma";
import { CheckinForm } from "@/features/checkins/checkin-form";
import { StaffAssignmentForm } from "@/features/events/staff-assignment-form";
import { InvitationQrActions } from "@/features/invitations/qr-actions";

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
    prisma.user.findMany({ where: { role: "STAFF" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.eventStaff.findMany({ where: { eventId }, select: { userId: true } }),
  ]) : null;
  return <div className="max-w-4xl space-y-6"><div className="flex flex-wrap items-start justify-between gap-4"><div>{role === "SUPER_ADMIN" ? <Link href={`/admin/clients/${event.client.id}`} className="text-sm text-emerald-800 underline">{event.client.name}</Link> : <p className="text-sm text-stone-500">{event.client.name}</p>}<h1 className="mt-2 text-3xl font-semibold text-emerald-950">{event.name}</h1><p className="mt-3 text-sm text-stone-500">{event.location || "Lokasi belum ditentukan"} · {formatEventDate(event.eventDate)}</p><div className="mt-3 flex flex-wrap items-center gap-3"><StatusBadge status={event.status} /><span className="text-xs text-stone-500">Slug: {event.slug}</span></div></div>{role === "SUPER_ADMIN" && <Link href={`/admin/events/${event.id}/edit`} className={linkButton}>Edit acara</Link>}</div>
    {event.client.status === "INACTIVE" && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Client nonaktif. Akses client, staff, dan check-in diblokir.</p>}
    <div className="rounded-2xl bg-emerald-900 p-6 text-white"><p className="text-sm text-emerald-100">Laporan kehadiran</p><p className="mt-2 text-3xl font-semibold">{attendance._sum.checkedInCount ?? 0} <span className="text-base font-normal">tamu hadir</span></p><p className="mt-2 text-xs text-emerald-100">{event._count.invitations} undangan terdaftar</p></div>
    {assignment && <StaffAssignmentForm key={assignment[1].map(({ userId }) => userId).sort().join(",")} eventId={event.id} staff={assignment[0]} assignedIds={assignment[1].map(({ userId }) => userId)} inactive={event.client.status === "INACTIVE"} />}
    {role === "SUPER_ADMIN" && event.status === "ACTIVE" && event.client.status === "ACTIVE" && <section className="space-y-3 rounded-2xl border border-[#d8c79e] bg-white p-5"><h2 className="font-semibold">QR umum pintu masuk</h2><p className="text-sm text-stone-600">Tamu mengisi nama dan mendapatkan tiket sementara. Kehadiran tetap memerlukan verifikasi petugas.</p><div className="flex flex-wrap gap-3"><a className={linkButton} href={`/api/admin/events/${event.id}/public-qr`} target="_blank" rel="noopener noreferrer">Lihat / cetak QR umum</a><a className={linkButton} href={`/api/admin/events/${event.id}/public-qr?download=1`}>Download QR umum PNG</a><Link className={linkButton} href={`/e/${event.slug}/checkin`} target="_blank" rel="noopener noreferrer">Buka halaman tamu</Link></div></section>}
    {role !== "CLIENT" && (event.status === "ACTIVE" && event.client.status === "ACTIVE" ? <CheckinForm key={event.id} eventId={event.id} /> : <p className="text-sm text-stone-500">Check-in tersedia ketika acara dan client berstatus aktif.</p>)}
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Daftar tamu <span className="text-xs font-normal text-stone-500">(maksimal 100)</span></h2>{role === "SUPER_ADMIN" && <Link href={`/admin/events/${event.id}/guests`} className={linkButton}>Kelola tamu & QR</Link>}</div>{guests.length ? <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">{guests.map((guest) => <li key={guest.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><p>{guest.guestName}</p><p className="mt-1 text-stone-500">{guest.checkedInAt ? `${guest.checkedInCount} hadir` : `Belum hadir · kuota ${guest.guestQuota}`}</p></div>{role === "SUPER_ADMIN" && <InvitationQrActions eventId={event.id} invitationId={guest.id} guestName={guest.guestName} />}</li>)}</ul> : <p className="text-sm text-stone-500">Belum ada undangan untuk acara ini.</p>}</section>
  </div>;
}
