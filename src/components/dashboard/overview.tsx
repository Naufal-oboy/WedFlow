import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/features/auth/access";
import { eventScope, eventSelect } from "@/features/events/scope";
import { roleHome, roleLabel } from "@/features/auth/roles";
import { EmptyState, PageHeading, StatusBadge } from "./management-ui";

export async function Overview({ role }: { role: Role }) {
  const user = await requirePageRole(role);
  const scope = eventScope(user);
  const [events, totalEvents, totalInvitations, checkedIn] = await Promise.all([
    prisma.event.findMany({ where: scope, select: eventSelect, orderBy: { eventDate: "asc" }, take: 20 }),
    prisma.event.count({ where: scope }),
    prisma.invitation.count({ where: { event: scope } }),
    prisma.invitation.aggregate({ where: { event: scope, checkedInAt: { not: null } }, _sum: { checkedInCount: true } }),
  ]);
  const staff = role === "STAFF";
  return <div className="space-y-8">
    <PageHeading title={staff ? "Siap menyambut tamu." : `Halo, ${user.name}.`} editorial={!staff} eyebrow={roleLabel[role]} description={staff ? "Pilih acara tugas Anda untuk mulai scan QR, cari nama, atau verifikasi antrean." : "Acara, undangan, dan kehadiran tamu Anda dalam satu ruang."} />
    <section aria-label="Ringkasan aktivitas" className="metric-grid grid-cols-3">{[
      { title: staff ? "Acara ditugaskan" : "Total acara", value: totalEvents },
      { title: "Undangan", value: totalInvitations },
      { title: "Tamu hadir", value: checkedIn._sum.checkedInCount ?? 0 },
    ].map(({ title, value }) => <div key={title} className="metric px-3 sm:px-6"><p className="text-xs text-muted-foreground sm:text-sm">{title}</p><p className="metric-value">{value}</p></div>)}</section>
    <section id="events"><div className="mb-5 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold text-primary">{staff ? "Acara tugas Anda" : "Acara Anda"}</h2><span className="text-xs text-muted-foreground">{events.length} dari {totalEvents} acara ditampilkan</span></div>
      {events.length ? <div className="surface divide-y divide-border">{events.map((event) => <Link key={event.id} href={`${roleHome[role]}/events/${event.id}`} className="group flex flex-wrap items-center gap-4 px-4 py-5 transition-colors hover:bg-accent/50 sm:gap-6 sm:p-6">
        <div className="hidden w-14 shrink-0 border-r border-border pr-5 text-center sm:block" aria-hidden="true"><span className="block text-2xl font-medium text-primary tabular-nums">{new Intl.DateTimeFormat("id-ID", { day: "2-digit", timeZone: "Asia/Jakarta" }).format(event.eventDate)}</span><span className="text-xs uppercase text-muted-foreground">{new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(event.eventDate)}</span></div>
        <div className="min-w-0 flex-1 basis-40"><p className="text-xs text-muted-foreground">{event.client.name}</p><h3 className="mt-1 font-semibold text-primary group-hover:underline underline-offset-4">{event.name}</h3><p className="mt-2 text-sm text-muted-foreground">{new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(event.eventDate)} · {event.location || "Lokasi belum ditentukan"}</p><p className="mt-2 text-xs text-muted-foreground">{event._count.invitations} undangan</p></div>
        <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:flex-col sm:items-end"><StatusBadge status={event.status} /><span className="inline-flex items-center gap-2 text-sm font-medium text-primary">{staff && event.status === "ACTIVE" ? "Buka check-in" : "Lihat acara"}<ArrowRight className="size-4" aria-hidden="true" /></span></div>
      </Link>)}</div> : <EmptyState title="Belum ada acara untuk ditampilkan" description={staff ? "Minta administrator menugaskan Anda ke acara. Acara tersebut akan muncul di sini." : "Administrator akan menghubungkan akun Anda dengan acara yang sesuai."} />}
    </section>
    {!staff && <p className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">Buka detail acara untuk melihat daftar undangan dan ringkasan kehadiran. Perubahan data tamu dikelola oleh administrator.</p>}
  </div>;
}
