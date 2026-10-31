import { DashboardPage } from "@/components/dashboard/dashboard-page";
import Link from "next/link";
import { requirePageRole } from "@/features/auth/access";
import { prisma } from "@/lib/prisma";
import { parseFilters, type SearchParams } from "@/features/management/validation";
import { EmptyState, PageHeading, Pagination, linkButton } from "@/components/dashboard/management-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

async function PageContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageRole("SUPER_ADMIN");
  const params = await searchParams;
  const parsed = parseFilters(params);
  if (!parsed.success) return <EmptyState title="Filter tidak valid" description="Periksa pencarian dan nomor halaman."><Link href="/admin/staff" className={linkButton}>Reset filter</Link></EmptyState>;
  const where = { role: "STAFF" as const, OR: [{ name: { contains: parsed.data.q, mode: "insensitive" as const } }, { email: { contains: parsed.data.q, mode: "insensitive" as const } }] };
  const total = await prisma.user.count({ where });
  const page = Math.min(parsed.data.page, Math.max(1, Math.ceil(total / 12)));
  const staff = await prisma.user.findMany({ where, select: { id: true, name: true, email: true, staffAssignments: { select: { event: { select: { id: true, name: true } } }, orderBy: { assignedAt: "desc" } } }, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 12, take: 12 });
  return <div className="space-y-7"><PageHeading title="Staff & penugasan" description="Satu staff dapat menangani beberapa acara. Kelola penugasan melalui detail acara."><Link href="/admin/users" className={linkButton}>Kelola akun staff</Link></PageHeading><form action="/admin/staff" className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-5"><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="q">Cari staff</Label><Input id="q" name="q" placeholder="Nama atau email" defaultValue={parsed.data.q} maxLength={120} /></div><Button type="submit">Cari</Button><Link href="/admin/staff" className="text-sm text-muted-foreground underline">Reset</Link></form>
    {staff.length ? <div className="grid gap-4 md:grid-cols-2">{staff.map((user) => <article key={user.id} className="rounded-lg border border-border bg-white p-6"><h2 className="font-semibold text-primary">{user.name}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{user.staffAssignments.length} penugasan</p><ul className="mt-3 space-y-2">{user.staffAssignments.map(({ event }) => <li key={event.id}><Link className="text-sm text-primary hover:underline" href={`/admin/events/${event.id}`}>{event.name} →</Link></li>)}</ul>{!user.staffAssignments.length && <p className="mt-3 text-sm text-muted-foreground">Belum ditugaskan. <Link href="/admin/events" className="text-primary underline">Pilih acara</Link></p>}</article>)}</div> : <EmptyState title="Belum ada staff yang cocok" description="Buat akun staff melalui menu Akun & akses atau ubah pencarian." />}
    <Pagination base="/admin/staff" params={params} total={total} page={page} />
  </div>;
}

export default function Page(props: Parameters<typeof PageContent>[0]) {
  return <DashboardPage><PageContent {...props} /></DashboardPage>;
}
