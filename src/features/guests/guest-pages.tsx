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
export function AttendanceBadge({ present, count, quota }: { present: boolean; count?: number | null; quota?: number }) {
  return <Badge variant="outline" className={present ? "border-success/20 bg-success-soft text-success" : "border-warning/20 bg-warning-soft text-warning"}>{present ? count && quota && count < quota ? "Sebagian hadir" : "Sudah hadir" : "Belum hadir"}</Badge>;
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
  const filtered = !!(parsed.data.q || parsed.data.attendance);
  return <div className="space-y-6">
    <Link href={`/admin/events/${eventId}`} className="inline-flex min-h-11 items-center text-sm text-primary underline">← Kembali ke detail acara</Link>
    <PageHeading title="Tamu & QR undangan" eyebrow="Daftar undangan" description={`${event.name} · ${total} ${filtered ? "hasil sesuai filter" : "undangan terdaftar"}`}><div className="flex flex-wrap gap-3"><GuestFormDialog eventId={eventId} /><ImportGuestDialog eventId={eventId} /></div></PageHeading>
    <form action={base} aria-label="Filter tamu" className="grid items-end gap-4 border-y border-border py-5 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]">
      <div className="space-y-2"><Label htmlFor="q">Cari tamu</Label><Input id="q" name="q" placeholder="Nama atau kode undangan" maxLength={150} defaultValue={parsed.data.q} /></div>
      <div className="space-y-2"><Label htmlFor="attendance">Kehadiran</Label><select id="attendance" name="attendance" className={selectClass} defaultValue={parsed.data.attendance}><option value="">Semua status</option><option value="present">Sudah hadir</option><option value="absent">Belum hadir</option></select></div>
      <div className="space-y-2"><Label htmlFor="sort">Urutkan</Label><select id="sort" name="sort" className={selectClass} defaultValue={parsed.data.sort}><option value="created_desc">Terbaru dibuat</option><option value="created_asc">Terlama dibuat</option><option value="name_asc">Nama A–Z</option><option value="name_desc">Nama Z–A</option></select></div>
      <div className="flex items-center gap-3"><Button type="submit" variant="outline">Terapkan</Button><Link href={base} className="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground underline">Reset</Link></div>
    </form>
    {guests.length ? <div className="surface overflow-hidden"><Table className="guest-table" role="table" aria-label="Daftar undangan tamu"><TableHeader role="rowgroup"><TableRow role="row"><TableHead scope="col">Nama tamu</TableHead><TableHead scope="col">Kuota</TableHead><TableHead scope="col">Kehadiran</TableHead><TableHead scope="col">Jumlah hadir</TableHead><TableHead scope="col">Aksi</TableHead></TableRow></TableHeader><TableBody role="rowgroup">{guests.map((guest) => <TableRow key={guest.id} role="row">
      <TableCell role="cell" className="guest-identity max-w-80 whitespace-normal"><Link href={`${base}/${guest.id}`} className="block min-h-11 content-center [overflow-wrap:anywhere] font-semibold text-primary hover:underline">{guest.guestName}</Link><p className="text-xs text-muted-foreground">Ref: {guest.id.slice(-8)}</p></TableCell>
      <TableCell role="cell" data-label="Kuota" className="tabular-nums">{guest.guestQuota} orang</TableCell><TableCell role="cell" data-label="Kehadiran"><AttendanceBadge present={!!guest.checkedInAt} count={guest.checkedInCount} quota={guest.guestQuota} /></TableCell><TableCell role="cell" data-label="Jumlah hadir" className="tabular-nums">{guest.checkedInCount ?? 0} / {guest.guestQuota}<p className="mt-1 whitespace-normal text-xs text-muted-foreground">{guest.checkedInAt ? formatEventDate(guest.checkedInAt) : "Belum check-in"}</p></TableCell>
      <TableCell role="cell" className="guest-actions"><div className="flex flex-wrap items-start gap-2"><InvitationQrActions compact eventId={eventId} invitationId={guest.id} guestName={guest.guestName} /><details className="min-w-0"><summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 font-medium text-primary hover:bg-muted" aria-label={`Kelola ${guest.guestName}`}>Kelola <span aria-hidden="true" className="ml-2">⌄</span></summary><div className="mt-2 flex flex-wrap gap-2"><Link href={`${base}/${guest.id}`} className="inline-flex min-h-11 items-center px-3 text-primary underline">Detail</Link><GuestFormDialog eventId={eventId} guest={guest} /><DeleteGuestButton eventId={eventId} guestId={guest.id} guestName={guest.guestName} checkedIn={!!guest.checkedInAt || !!guest.checkedInCount} /></div></details></div></TableCell>
    </TableRow>)}</TableBody></Table></div> : <EmptyState title={filtered ? "Tidak ada tamu yang cocok" : "Daftar tamu masih kosong"} description={filtered ? "Coba nama lain, kode undangan, atau reset filter untuk melihat semua tamu." : "Mulai dengan menambahkan tamu pertama atau impor daftar undangan dari CSV."}>{filtered && <Link href={base} className={linkButton}>Reset filter</Link>}</EmptyState>}
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
  return <div className="max-w-4xl space-y-6"><Link href={`/admin/events/${eventId}/guests`} className="inline-flex min-h-11 items-center text-sm text-primary underline">← Kembali ke daftar tamu</Link>
    <PageHeading title="Detail undangan" description={event.name}><div className="flex flex-wrap gap-3"><InvitationQrActions eventId={eventId} invitationId={guest.id} guestName={guest.guestName} /><GuestFormDialog eventId={eventId} guest={guest} /><DeleteGuestButton eventId={eventId} guestId={guest.id} guestName={guest.guestName} checkedIn={!!guest.checkedInAt || !!guest.checkedInCount || !!guest.checkedInBy} returnToList /></div></PageHeading>
    <div className="rounded-lg border border-border bg-white p-6"><AttendanceBadge present={!!guest.checkedInAt} /><dl className="mt-6 grid gap-6 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium text-primary">{value}</dd></div>)}</dl></div>
    {guest.checkedInAt && <p className="text-sm text-muted-foreground">Undangan sudah check-in. Riwayat kehadiran dipertahankan dan penghapusan dinonaktifkan.</p>}
  </div>;
}
