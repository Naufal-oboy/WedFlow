import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccessError, requirePageRole } from "@/features/auth/access";
import { EmptyState, PageHeading, Pagination, linkButton, selectClass } from "@/components/dashboard/management-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEventDate, type SearchParams } from "@/features/management/validation";
import { guestFiltersSchema } from "./validation";
import { getGuest, listGuests, requireGuestEvent } from "./service";
import { DeleteGuestButton, GuestFormDialog } from "./guest-actions";
import { ImportGuestDialog } from "./import-dialog";
import { InvitationQrActions } from "@/features/invitations/qr-actions";

async function pageData<T>(work: () => Promise<T>) {
  try { return await work(); }
  catch (error) { if (error instanceof AccessError && error.status === 404) notFound(); throw error; }
}
export function AttendanceBadge({ present }: { present: boolean }) {
  return <Badge variant="outline" className={present ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}>{present ? "Sudah hadir" : "Belum hadir"}</Badge>;
}

export async function GuestListPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<SearchParams> }) {
  await requirePageRole("SUPER_ADMIN");
  const { eventId } = await params;
  if (!z.uuid().safeParse(eventId).success) notFound();
  const base = `/admin/events/${eventId}/guests`;
  const query = await searchParams;
  const parsed = guestFiltersSchema.safeParse(query);
  if (!parsed.success) {
    await pageData(() => requireGuestEvent(eventId));
    return <EmptyState title="Filter tidak valid" description="Periksa kata pencarian, status kehadiran, urutan, dan halaman."><Link href={base} className={linkButton}>Reset filter</Link></EmptyState>;
  }
  const { event, guests, total, page, pageSize } = await pageData(() => listGuests(eventId, parsed.data));
  return <div className="space-y-6">
    <Link href={`/admin/events/${eventId}`} className="text-sm text-emerald-800 underline">← Kembali ke detail acara</Link>
    <PageHeading title="Tamu & QR undangan" description={`Kelola daftar tamu untuk ${event.name}.`}><div className="flex flex-wrap gap-3"><ImportGuestDialog eventId={eventId} /><GuestFormDialog eventId={eventId} /></div></PageHeading>
    <form action={base} className="grid items-end gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2"><Label htmlFor="q">Cari tamu</Label><Input id="q" name="q" placeholder="Nama atau kode undangan" maxLength={150} defaultValue={parsed.data.q} /></div>
      <div className="space-y-2"><Label htmlFor="attendance">Kehadiran</Label><select id="attendance" name="attendance" className={selectClass} defaultValue={parsed.data.attendance}><option value="">Semua status</option><option value="present">Sudah hadir</option><option value="absent">Belum hadir</option></select></div>
      <div className="space-y-2"><Label htmlFor="sort">Urutkan</Label><select id="sort" name="sort" className={selectClass} defaultValue={parsed.data.sort}><option value="created_desc">Terbaru dibuat</option><option value="created_asc">Terlama dibuat</option><option value="name_asc">Nama A–Z</option><option value="name_desc">Nama Z–A</option></select></div>
      <div className="flex items-center gap-3"><Button type="submit">Terapkan</Button><Link href={base} className="text-sm text-stone-500 underline">Reset</Link></div>
    </form>
    {guests.length ? <div className="overflow-hidden rounded-xl border border-stone-200 bg-white"><Table><TableHeader><TableRow><TableHead>Nama tamu</TableHead><TableHead>Kode undangan</TableHead><TableHead>Kuota</TableHead><TableHead>Kehadiran</TableHead><TableHead>Jumlah hadir</TableHead><TableHead>Check-in (WIB)</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>{guests.map((guest) => <TableRow key={guest.id}>
      <TableCell className="min-w-40 max-w-64 whitespace-normal"><Link href={`${base}/${guest.id}`} className="font-medium text-emerald-900 hover:underline">{guest.guestName}</Link></TableCell>
      <TableCell><code className="block max-w-48 whitespace-normal break-all text-xs">{guest.code}</code></TableCell><TableCell>{guest.guestQuota}</TableCell><TableCell><AttendanceBadge present={!!guest.checkedInAt} /></TableCell><TableCell>{guest.checkedInCount ?? 0}</TableCell><TableCell>{guest.checkedInAt ? formatEventDate(guest.checkedInAt) : "—"}</TableCell>
      <TableCell><div className="flex flex-wrap items-center gap-2"><InvitationQrActions eventId={eventId} invitationId={guest.id} guestName={guest.guestName} /><Link href={`${base}/${guest.id}`} className="px-2 text-emerald-800 underline">Detail</Link><GuestFormDialog eventId={eventId} guest={guest} /><DeleteGuestButton eventId={eventId} guestId={guest.id} guestName={guest.guestName} checkedIn={!!guest.checkedInAt || !!guest.checkedInCount} /></div></TableCell>
    </TableRow>)}</TableBody></Table></div> : <EmptyState title="Belum ada tamu yang cocok" description="Tambahkan tamu, impor CSV, atau sesuaikan filter pencarian." />}
    <Pagination base={base} params={query} total={total} page={page} pageSize={pageSize} />
  </div>;
}

export async function GuestDetailPage({ params }: { params: Promise<{ eventId: string; guestId: string }> }) {
  await requirePageRole("SUPER_ADMIN");
  const { eventId, guestId } = await params;
  if (!z.uuid().safeParse(eventId).success || !z.uuid().safeParse(guestId).success) notFound();
  const { event, guest } = await pageData(() => getGuest(eventId, guestId));
  const fields = [
    ["Nama tamu", guest.guestName], ["Acara", event.name], ["Kode undangan", guest.code],
    ["Kuota", guest.guestQuota], ["Jumlah hadir", guest.checkedInCount ?? 0],
    ["Waktu check-in (WIB)", guest.checkedInAt ? formatEventDate(guest.checkedInAt) : "Belum check-in"],
    ["Petugas check-in", guest.checkedInBy?.name ?? "—"], ["Dibuat (WIB)", formatEventDate(guest.createdAt)],
  ];
  return <div className="max-w-4xl space-y-6"><Link href={`/admin/events/${eventId}/guests`} className="text-sm text-emerald-800 underline">← Kembali ke daftar tamu</Link>
    <PageHeading title="Detail undangan" description={event.name}><div className="flex flex-wrap gap-3"><InvitationQrActions eventId={eventId} invitationId={guest.id} guestName={guest.guestName} /><GuestFormDialog eventId={eventId} guest={guest} /><DeleteGuestButton eventId={eventId} guestId={guest.id} guestName={guest.guestName} checkedIn={!!guest.checkedInAt || !!guest.checkedInCount || !!guest.checkedInBy} returnToList /></div></PageHeading>
    <div className="rounded-2xl border border-stone-200 bg-white p-6"><AttendanceBadge present={!!guest.checkedInAt} /><dl className="mt-6 grid gap-6 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 break-words font-medium text-emerald-950">{value}</dd></div>)}</dl></div>
    {guest.checkedInAt && <p className="text-sm text-stone-500">Undangan sudah check-in. Riwayat kehadiran dipertahankan dan penghapusan dinonaktifkan.</p>}
  </div>;
}
