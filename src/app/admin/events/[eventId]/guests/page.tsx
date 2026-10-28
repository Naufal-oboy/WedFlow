import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { requirePageRole } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { GuestForm } from "@/features/invitations/guest-form";
import { GuestImport } from "@/features/invitations/guest-import";
import { InvitationQrActions } from "@/features/invitations/qr-actions";
import { guestListSchema } from "@/features/invitations/guest-validation";
import { formatEventDate, single, type SearchParams } from "@/features/management/validation";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ eventId: string }>; searchParams: Promise<SearchParams> };

async function GuestPage({ params, searchParams }: Props) {
  const user = await requirePageRole("SUPER_ADMIN");
  const { eventId } = await params;
  if (!z.uuid().safeParse(eventId).success) notFound();
  const event = await prisma.event.findFirst({ where: { AND: [{ id: eventId }, eventScope(user)] }, select: { id: true, name: true, eventDate: true, location: true } });
  if (!event) notFound();
  const query = await searchParams;
  const parsed = guestListSchema.safeParse({ q: single(query, "q"), page: single(query, "page") || 1 });
  if (!parsed.success) return <p role="alert">Filter atau nomor halaman tidak valid. <Link href={`/admin/events/${eventId}/guests`} className="underline">Kembali ke daftar tamu</Link></p>;
  const { q, page } = parsed.data;
  const pageSize = 25;
  const where = { eventId, event: eventScope(user), ...(q ? { guestName: { contains: q, mode: "insensitive" as const } } : {}) };
  const [guests, total] = await Promise.all([
    prisma.invitation.findMany({ where, select: { id: true, guestName: true, guestQuota: true, checkedInAt: true, checkedInCount: true }, orderBy: [{ guestName: "asc" }, { id: "asc" }], take: pageSize, skip: (page - 1) * pageSize }),
    prisma.invitation.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageLink = (number: number) => `?${new URLSearchParams({ q, page: String(number) })}`;
  return <div className="space-y-6">
    <Link href={`/admin/events/${eventId}`} className="text-sm text-emerald-800 underline">Kembali ke detail acara</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-[#73603b]">Guest Management</p><h1 className="mt-2 text-3xl font-semibold text-emerald-950">Tamu & QR undangan</h1><p className="mt-2 font-medium">{event.name}</p><p className="mt-1 text-sm text-stone-500">{formatEventDate(event.eventDate)} · {event.location ?? "Lokasi belum ditentukan"}</p></div><GuestForm eventId={eventId} /></div>
    <GuestImport eventId={eventId} />
    <form className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><label htmlFor="guest-search" className="mb-2 block text-sm font-medium">Filter nama tamu</label><input id="guest-search" name="q" maxLength={160} defaultValue={q} placeholder="Nama tamu" className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm" /></div><button type="submit" className="h-10 rounded-lg bg-emerald-900 px-4 text-sm text-white">Terapkan</button>{q && <Link href={`/admin/events/${eventId}/guests`} className="py-2 text-sm text-emerald-800 underline">Reset</Link>}</form>
    <p className="text-sm text-stone-500">{total} undangan · Halaman {page} dari {pages}</p>
    {guests.length ? <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">{guests.map((guest) => <li key={guest.id} className="space-y-4 p-5 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:space-y-0"><div className="min-w-0"><h2 className="break-words font-medium text-emerald-950">{guest.guestName}</h2><p className="mt-1 text-sm text-stone-500">Kuota {guest.guestQuota} · {guest.checkedInAt ? `Sudah hadir (${guest.checkedInCount} orang)` : "Belum hadir"}</p></div><div className="flex flex-wrap items-center gap-2"><InvitationQrActions eventId={eventId} invitationId={guest.id} guestName={guest.guestName} />{!guest.checkedInAt && <GuestForm eventId={eventId} guest={guest} />}</div></li>)}</ul> : <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center"><h2 className="font-medium">{q ? "Tamu tidak ditemukan" : "Belum ada tamu di halaman ini"}</h2><p className="mt-2 text-sm text-stone-500">Tambah tamu, impor CSV, atau sesuaikan filter dan halaman.</p></div>}
    <nav aria-label="Halaman daftar tamu" className="flex justify-between gap-4 text-sm text-emerald-800">{page > 1 ? <Link className="underline" href={pageLink(page - 1)}>Sebelumnya</Link> : <span />}{page < pages && <Link className="underline" href={pageLink(page + 1)}>Berikutnya</Link>}</nav>
  </div>;
}

export default function Page(props: Props) {
  return <DashboardPage><GuestPage {...props} /></DashboardPage>;
}
