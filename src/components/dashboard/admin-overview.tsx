import Link from "next/link";
import { Users, CalendarDays, CalendarClock, Activity } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/features/auth/access";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, EventTable, PageHeading, linkButton } from "./management-ui";

export async function AdminOverview() {
  const user = await requirePageRole("SUPER_ADMIN");
  const [clients, total, upcoming, active, events] = await Promise.all([
    prisma.client.count(), prisma.event.count(),
    prisma.event.count({ where: { eventDate: { gte: new Date() }, status: { in: ["DRAFT", "ACTIVE"] }, client: { status: "ACTIVE" } } }),
    prisma.event.count({ where: { status: "ACTIVE", client: { status: "ACTIVE" } } }),
    prisma.event.findMany({ include: { client: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 6 }),
  ]);
  return <div className="space-y-8"><PageHeading title={`Halo, ${user.name}.`} description="Kelola client, siapkan acara, dan pastikan petugas siap menyambut setiap tamu."><Link href="/admin/events/new" className={linkButton}>Tambah acara</Link></PageHeading>
    <section aria-label="Ringkasan admin" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      { title: "Total client", value: clients, Icon: Users, href: "/admin/clients", note: "Seluruh client terdaftar" },
      { title: "Total acara", value: total, Icon: CalendarDays, href: "/admin/events", note: "Semua status acara" },
      { title: "Acara mendatang", value: upcoming, Icon: CalendarClock, href: "/admin/events", note: "Draft / aktif, client aktif" },
      { title: "Acara aktif", value: active, Icon: Activity, href: "/admin/events?status=ACTIVE", note: "Status aktif, client aktif" },
    ].map(({ title, value, Icon, href, note }) => <Link href={href} key={title}><Card className="h-full bg-white py-6 ring-stone-200 transition hover:ring-emerald-600"><CardContent className="px-6"><div className="flex items-center justify-between text-sm text-stone-500"><span>{title}</span><Icon className="size-5 text-emerald-700" /></div><p className="mt-4 text-3xl font-semibold text-emerald-950">{value}</p><p className="mt-2 text-xs text-stone-500">{note}</p></CardContent></Card></Link>)}</section>
    <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-emerald-950">Acara terbaru</h2><Link href="/admin/events" className="text-sm text-emerald-800 underline">Lihat semua</Link></div>{events.length ? <EventTable events={events} /> : <EmptyState title="Siapkan perayaan pertama" description="Mulai dengan menambahkan client, lalu buat acara dan tugaskan staff."><Link href="/admin/clients/new" className={linkButton}>Tambah client</Link></EmptyState>}</section>
  </div>;
}
