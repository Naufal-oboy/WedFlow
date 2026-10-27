import { DashboardPage } from "@/components/dashboard/dashboard-page";
import Link from "next/link";
import { requirePageRole } from "@/features/auth/access";
import { listClients } from "@/features/management/queries";
import { parseFilters, clientTypes, clientStatuses, type SearchParams } from "@/features/management/validation";
import { EmptyState, PageHeading, Pagination, StatusBadge, linkButton, selectClass } from "@/components/dashboard/management-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

async function PageContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageRole("SUPER_ADMIN");
  const params = await searchParams;
  const parsed = parseFilters(params);
  if (!parsed.success) return <EmptyState title="Filter tidak valid" description="Periksa pencarian dan nomor halaman."><Link href="/admin/clients" className={linkButton}>Reset filter</Link></EmptyState>;
  const { clients, total, page } = await listClients(parsed.data);
  return <div className="space-y-7"><PageHeading title="Client" description="Kelola pelanggan dan seluruh acara mereka dalam satu ruang kerja."><Link href="/admin/clients/new" className={linkButton}>Tambah client</Link></PageHeading>
    <form action="/admin/clients" className="grid items-end gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]"><div className="space-y-2"><Label htmlFor="q">Cari client</Label><Input id="q" name="q" defaultValue={parsed.data.q} maxLength={120} placeholder="Nama, email, atau telepon" /></div><div className="space-y-2"><Label htmlFor="status">Status</Label><select className={selectClass} id="status" name="status" defaultValue={parsed.data.status}><option value="">Semua status</option>{Object.entries(clientStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="space-y-2"><Label htmlFor="type">Jenis client</Label><select className={selectClass} id="type" name="type" defaultValue={parsed.data.type}><option value="">Semua jenis</option>{Object.entries(clientTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="flex items-center gap-3"><Button type="submit">Terapkan</Button><Link href="/admin/clients" className="text-sm text-stone-500 underline">Reset</Link></div></form>
    {clients.length ? <div className="overflow-hidden rounded-xl border border-stone-200 bg-white"><Table><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Kontak</TableHead><TableHead>Status</TableHead><TableHead>Acara</TableHead><TableHead><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader><TableBody>{clients.map((client) => <TableRow key={client.id}><TableCell><Link href={`/admin/clients/${client.id}`} className="font-medium text-emerald-900 hover:underline">{client.name}</Link><p className="mt-1 text-xs text-stone-500">{clientTypes[client.type]}</p></TableCell><TableCell><p>{client.email || "—"}</p><p className="text-xs text-stone-500">{client.phone || "—"}</p></TableCell><TableCell><StatusBadge status={client.status} /></TableCell><TableCell>{client._count.events}</TableCell><TableCell><Link href={`/admin/clients/${client.id}/edit`} className="text-emerald-800 hover:underline" aria-label={`Edit ${client.name}`}>Edit</Link></TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState title="Belum ada client yang cocok" description="Tambahkan client pertama atau ubah filter pencarian." />}
    <Pagination base="/admin/clients" params={params} page={page} total={total} />
  </div>;
}

export default function Page(props: Parameters<typeof PageContent>[0]) {
  return <DashboardPage><PageContent {...props} /></DashboardPage>;
}
