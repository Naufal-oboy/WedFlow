import { DashboardPage } from "@/components/dashboard/dashboard-page";
import Link from "next/link";
import { requirePageRole } from "@/features/auth/access";
import { prisma } from "@/lib/prisma";
import { listAdminEvents } from "@/features/management/queries";
import { parseFilters, eventStatuses, type SearchParams } from "@/features/management/validation";
import { EmptyState, EventTable, PageHeading, Pagination, linkButton, selectClass } from "@/components/dashboard/management-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function PageContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageRole("SUPER_ADMIN");
  const params = await searchParams;
  const parsed = parseFilters(params);
  if (!parsed.success) return <EmptyState title="Filter tidak valid" description="Periksa tanggal awal/akhir, client, dan nomor halaman."><Link href="/admin/events" className={linkButton}>Reset filter</Link></EmptyState>;
  const [{ events, total, page }, clients] = await Promise.all([listAdminEvents(parsed.data), prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  return <div className="space-y-7"><PageHeading title="Acara" description="Atur jadwal, lokasi, status, dan petugas untuk setiap perayaan."><Link href="/admin/events/new" className={linkButton}>Tambah acara</Link></PageHeading>
    <form action="/admin/events" className="grid items-end gap-4 rounded-lg border border-border bg-white p-5 sm:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-2"><Label htmlFor="q">Cari acara</Label><Input id="q" name="q" defaultValue={parsed.data.q} maxLength={120} placeholder="Nama atau slug acara" /></div>
      <div className="space-y-2"><Label htmlFor="clientId">Client</Label><select className={selectClass} id="clientId" name="clientId" defaultValue={parsed.data.clientId}><option value="">Semua client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="status">Status</Label><select className={selectClass} id="status" name="status" defaultValue={parsed.data.status}><option value="">Semua status</option>{Object.entries(eventStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="from">Dari tanggal (WIB)</Label><Input id="from" name="from" type="date" defaultValue={parsed.data.from} /></div><div className="space-y-2"><Label htmlFor="to">Sampai tanggal (WIB)</Label><Input id="to" name="to" type="date" defaultValue={parsed.data.to} /></div>
      <div className="flex items-center gap-3"><Button type="submit">Terapkan</Button><Link href="/admin/events" className="text-sm text-muted-foreground underline">Reset</Link></div>
    </form>
    {events.length ? <EventTable events={events} /> : <EmptyState title="Belum ada acara yang cocok" description="Tambahkan acara baru atau sesuaikan filter pencarian." />}
    <Pagination base="/admin/events" params={params} page={page} total={total} />
  </div>;
}

export default function Page(props: Parameters<typeof PageContent>[0]) {
  return <DashboardPage><PageContent {...props} /></DashboardPage>;
}
