import { AttendanceDashboard } from "@/features/attendance/dashboard";
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
  const guests = await prisma.invitation.findMany({ where: { event: scope }, select: { id: true, guestName: true, guestQuota: true, checkedInAt: true, checkedInCount: true }, take: 100, orderBy: { guestName: "asc" } });
  const assignment = role === "SUPER_ADMIN" ? await Promise.all([
    prisma.user.findMany({ where: { role: "STAFF" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.eventStaff.findMany({ where: { eventId }, select: { userId: true } }),
  ]) : null;
  const active = event.status === "ACTIVE" && event.client.status === "ACTIVE";
  const admin = role === "SUPER_ADMIN";
  return <div className="max-w-6xl space-y-8">
    <header className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0 basis-full sm:basis-0 flex-1"><p className="eyebrow">{role === "STAFF" ? "Penerimaan tamu" : "Ruang acara"}</p>{admin ? <Link href={`/admin/clients/${event.client.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm text-primary underline">{event.client.name}</Link> : <p className="mt-3 text-sm text-muted-foreground">{event.client.name}</p>}<h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">{event.name}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{formatEventDate(event.eventDate)}<br />{event.location || "Lokasi belum ditentukan"}</p><div className="mt-3"><StatusBadge status={event.status} /></div></div>
      {admin && <Link href={`/admin/events/${event.id}/guests`} className={linkButton}>Kelola tamu & QR</Link>}
    </header>
    <nav aria-label="Navigasi acara" className="flex flex-wrap gap-1 border-y py-2">
      <a className="event-section-link" href="#overview">Ringkasan</a>
      <a className="event-section-link" href="#guests">Tamu</a>
      {admin && <Link className="event-section-link" href={`/admin/events/${event.id}/guests`}>QR undangan</Link>}
      {role !== "CLIENT" && <a className="event-section-link" href="#checkin">Check-in & antrean</a>}
      {admin && active && <a className="event-section-link" href="#public-precheckin">Pre-check-in publik</a>}
      {admin && <a className="event-section-link" href="#settings">Pengaturan</a>}
    </nav>
    {event.client.status === "INACTIVE" && <p className="rounded-xl bg-warning-soft p-4 text-sm text-warning">Client nonaktif. Akses client, staff, dan check-in diblokir.</p>}
    <AttendanceDashboard key={event.id} eventId={event.id} canExport={role !== "STAFF"} />
    {role !== "CLIENT" && <section id="checkin" aria-label="Operasional check-in">{active ? <CheckinForm key={event.id} eventId={event.id} /> : <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">Check-in tersedia ketika acara dan client berstatus aktif.</p>}</section>}
    {admin && active && <section id="public-precheckin" className="space-y-4 border-y py-6"><div><p className="eyebrow mb-2">Untuk pintu masuk</p><h2 className="text-lg font-semibold">QR umum & pre-check-in</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Pasang QR umum di lokasi acara. Tamu mengisi nama dan mendapatkan tiket sementara untuk diverifikasi petugas.</p></div><div className="flex flex-wrap gap-3"><a className={linkButton} href={`/api/admin/events/${event.id}/public-qr`} target="_blank" rel="noopener noreferrer">Lihat / cetak QR umum<span className="sr-only"> (tab baru)</span></a><a className="event-section-link border" href={`/api/admin/events/${event.id}/public-qr?download=1`}>Download QR umum PNG</a><Link className="event-section-link underline" href={`/e/${event.slug}/checkin`} target="_blank" rel="noopener noreferrer">Buka halaman tamu<span className="sr-only"> (tab baru)</span></Link></div></section>}
    <section id="guests"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Daftar tamu</h2><p className="mt-1 text-sm text-muted-foreground">Menampilkan {guests.length} dari {event._count.invitations} undangan · urutan nama A–Z</p></div>{admin && <Link href={`/admin/events/${event.id}/guests`} className="event-section-link underline">Lihat semua tamu</Link>}</div>{guests.length ? <ul tabIndex={0} aria-label="Daftar tamu acara, gulir untuk melihat lainnya" className="max-h-[32rem] overflow-y-auto divide-y border-y pr-2">{guests.map((guest) => <li key={guest.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"><div className="min-w-0 flex-1"><p className="font-medium">{guest.guestName}</p><p className="mt-1 text-muted-foreground">{guest.checkedInCount ?? 0} / {guest.guestQuota} hadir · {guest.checkedInAt ? "Sudah check-in" : "Belum hadir"}</p></div>{admin && <InvitationQrActions compact eventId={event.id} invitationId={guest.id} guestName={guest.guestName} />}</li>)}</ul> : <p className="border-y py-8 text-sm text-muted-foreground">Belum ada undangan untuk acara ini.</p>}</section>
    {assignment && <section id="settings" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Pengaturan acara</h2><Link href={`/admin/events/${event.id}/edit`} className="event-section-link border">Edit acara</Link></div><StaffAssignmentForm key={assignment[1].map(({ userId }) => userId).sort().join(",")} eventId={event.id} staff={assignment[0]} assignedIds={assignment[1].map(({ userId }) => userId)} inactive={event.client.status === "INACTIVE"} /></section>}
  </div>;
}
