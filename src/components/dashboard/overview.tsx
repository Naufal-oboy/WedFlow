import Link from "next/link";
import { CalendarDays, ArrowUpRight, Users, CheckCheck } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/features/auth/access";
import { eventScope, eventSelect } from "@/features/events/scope";
import { roleHome, roleLabel } from "@/features/auth/roles";
import { Card, CardContent } from "@/components/ui/card";

export async function Overview({ role }: { role: Role }) {
  const user = await requirePageRole(role);
  const scope = eventScope(user);
  const [events, totalEvents, totalInvitations, checkedIn] = await Promise.all([
    prisma.event.findMany({ where: scope, select: eventSelect, orderBy: { eventDate: "asc" }, take: 20 }),
    prisma.event.count({ where: scope }),
    prisma.invitation.count({ where: { event: scope } }),
    prisma.invitation.aggregate({ where: { event: scope, checkedInAt: { not: null } }, _sum: { checkedInCount: true } }),
  ]);
  const description = role === "SUPER_ADMIN" ? "Pantau seluruh acara dan aktivitas penyambutan tamu." : role === "CLIENT" ? "Ikuti persiapan acara dan kehadiran tamu Anda." : "Lihat acara yang ditugaskan dan sambut setiap tamu dengan baik.";
  return <div className="space-y-9">
    <section><p className="mb-2 text-xs font-semibold tracking-[0.18em] text-[#9b824c] uppercase">{roleLabel[role]} workspace</p><h1 className="text-3xl font-semibold tracking-tight text-emerald-950">Halo, {user.name}.</h1><p className="mt-3 text-sm leading-6 text-stone-500">{description}</p></section>
    <section aria-label="Ringkasan aktivitas" className="grid gap-4 sm:grid-cols-3">{[
      { title: role === "STAFF" ? "Acara ditugaskan" : "Total acara", value: totalEvents, Icon: CalendarDays },
      { title: "Undangan", value: totalInvitations, Icon: Users },
      { title: "Tamu hadir", value: checkedIn._sum.checkedInCount ?? 0, Icon: CheckCheck },
    ].map(({ title, value, Icon }) => <Card key={title} className="bg-white py-6 ring-stone-200"><CardContent className="px-6"><div className="flex items-center justify-between text-sm text-stone-500"><span>{title}</span><Icon className="size-5 text-emerald-700" /></div><p className="mt-4 text-3xl font-semibold text-emerald-950">{value}</p></CardContent></Card>)}</section>
    <section id="events" className="scroll-mt-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-emerald-950">{role === "STAFF" ? "Acara tugas Anda" : "Daftar acara"}</h2><span className="text-xs text-stone-500">{events.length} ditampilkan</span></div>
      {events.length ? <div className="grid gap-4 xl:grid-cols-2">{events.map((event) => <Link key={event.id} href={`${roleHome[role]}/events/${event.id}`} className="group rounded-2xl border border-stone-200 bg-white p-6 transition hover:border-emerald-700 hover:shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs text-stone-500">{event.client.name}</p><ArrowUpRight className="size-4 text-emerald-800" /></div><h3 className="mt-3 font-semibold text-emerald-950">{event.name}</h3><p className="mt-2 text-sm text-stone-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(event.eventDate)}</p><div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4 text-xs text-stone-500"><span>{event._count.invitations} undangan</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{event.status}</span></div></Link>)}</div> : <div className="rounded-2xl border border-dashed border-stone-300 bg-white/50 px-6 py-14 text-center"><CalendarDays className="mx-auto mb-4 size-8 text-[#b49b64]" /><h3 className="font-medium text-emerald-950">Belum ada acara untuk ditampilkan</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">{role === "SUPER_ADMIN" ? "Acara yang dibuat akan muncul di sini." : "Administrator akan menghubungkan akun Anda dengan acara yang sesuai."}</p></div>}
    </section>
  </div>;
}
