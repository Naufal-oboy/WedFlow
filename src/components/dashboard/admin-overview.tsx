import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/features/auth/access";
import { EmptyState, EventTable, PageHeading, linkButton } from "./management-ui";

export async function AdminOverview() {
  const user = await requirePageRole("SUPER_ADMIN");
  const [clients, total, upcoming, active, events, scheduled] = await Promise.all([
    prisma.client.count(), prisma.event.count(),
    prisma.event.count({ where: { eventDate: { gte: new Date() }, status: { in: ["DRAFT", "ACTIVE"] }, client: { status: "ACTIVE" } } }),
    prisma.event.count({ where: { status: "ACTIVE", client: { status: "ACTIVE" } } }),
    prisma.event.findMany({ include: { client: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 6 }),
    prisma.event.findMany({ where: { eventDate: { gte: new Date() }, status: { in: ["DRAFT", "ACTIVE"] }, client: { status: "ACTIVE" } }, include: { client: { select: { name: true } } }, orderBy: [{ eventDate: "asc" }, { id: "asc" }], take: 4 }),
  ]);
  return <div className="space-y-8"><PageHeading title={`Halo, ${user.name}.`} editorial eyebrow="Ringkasan operasional" description="Kelola client, siapkan acara, dan koordinasikan penyambutan tamu."><Link href="/admin/events/new" className={linkButton}><Plus className="size-4" aria-hidden="true" />Tambah acara</Link></PageHeading>
    <section aria-label="Ringkasan admin" className="metric-grid xl:grid-cols-4">{[
      { title: "Total client", value: clients, href: "/admin/clients", note: "Client terdaftar" },
      { title: "Total acara", value: total, href: "/admin/events", note: "Seluruh status" },
      { title: "Acara mendatang", value: upcoming, href: "#upcoming", note: "Draft dan aktif" },
      { title: "Acara aktif", value: active, href: "/admin/events?status=ACTIVE", note: "Siap menerima tamu" },
    ].map(({ title, value, href, note }) => <Link href={href} key={title} className="metric border-b border-border transition-colors hover:bg-accent/50 xl:border-b-0"><p className="text-sm text-muted-foreground">{title}</p><p className="metric-value">{value}</p><p className="mt-2 text-xs text-muted-foreground">{note}</p></Link>)}</section>
    <section id="upcoming" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-primary">Agenda mendatang</h2><span className="text-xs text-muted-foreground">{scheduled.length} jadwal terdekat · WIB</span></div>{scheduled.length ? <EventTable events={scheduled} /> : <EmptyState title="Belum ada agenda mendatang" description="Acara mendatang dengan status draft atau aktif akan muncul di sini." />}</section>
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_240px]"><section className="min-w-0 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-primary">Acara terbaru</h2><Link href="/admin/events" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">Lihat semua<ArrowRight className="size-4" aria-hidden="true" /></Link></div>{events.length ? <EventTable events={events} /> : <EmptyState title="Siapkan perayaan pertama" description="Mulai dengan menambahkan client, lalu buat acara dan tugaskan staff."><Link href="/admin/clients/new" className={linkButton}>Tambah client</Link></EmptyState>}</section>
    <section className="border-t border-border pt-5 xl:mt-2"><h2 className="text-sm font-semibold text-primary">Persiapan acara</h2><div className="mt-3 divide-y divide-border">{[{ href: "/admin/clients", title: "Kelola client", note: "Data pasangan dan penyelenggara" }, { href: "/admin/staff", title: "Staff & penugasan", note: "Atur petugas di setiap acara" }, { href: "/admin/users", title: "Akun & akses", note: "Kelola akses ruang kerja" }].map(item => <Link key={item.href} href={item.href} className="group flex min-h-20 items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium group-hover:underline">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.note}</p></div><ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" /></Link>)}</div></section></div>
  </div>;
}
