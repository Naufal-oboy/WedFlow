import { DashboardPage } from "@/components/dashboard/dashboard-page";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/features/auth/access";
import { prisma } from "@/lib/prisma";
import { ClientStatusButton } from "@/features/clients/client-status-button";
import { clientTypes } from "@/features/management/validation";
import { EmptyState, EventTable, PageHeading, StatusBadge, linkButton } from "@/components/dashboard/management-ui";

async function PageContent({ params }: { params: Promise<{ clientId: string }> }) {
  await requirePageRole("SUPER_ADMIN");
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { _count: { select: { events: true, users: true } } } });
  if (!client) notFound();
  const events = await prisma.event.findMany({ where: { clientId }, include: { client: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 10 });
  return <div className="space-y-7"><Link href="/admin/clients" className="text-sm text-emerald-800 hover:underline">← Semua client</Link><PageHeading title={client.name} description={clientTypes[client.type]}><div className="flex flex-wrap items-center gap-3"><Link href={`/admin/clients/${client.id}/edit`} className={linkButton}>Edit client</Link><ClientStatusButton id={client.id} active={client.status === "ACTIVE"} /></div></PageHeading>
    <section aria-label="Informasi client" className="rounded-2xl border border-stone-200 bg-white p-6"><dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-sm text-stone-500">Email</dt><dd className="mt-2 break-all">{client.email || "Belum diisi"}</dd></div><div><dt className="text-sm text-stone-500">Telepon</dt><dd className="mt-2">{client.phone || "Belum diisi"}</dd></div><div><dt className="text-sm text-stone-500">Status layanan</dt><dd className="mt-2"><StatusBadge status={client.status} /></dd></div><div><dt className="text-sm text-stone-500">Acara / akun terhubung</dt><dd className="mt-2">{client._count.events} acara · {client._count.users} akun</dd></div></dl></section>
    {client.status === "INACTIVE" && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Client nonaktif. Riwayat tersimpan; login client, akses staff, dan pembuatan acara baru diblokir sampai client diaktifkan kembali.</p>}
    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Acara client</h2>{client.status === "ACTIVE" && <Link className={linkButton} href={`/admin/events/new?clientId=${client.id}`}>Tambah acara</Link>}</div>{events.length ? <EventTable events={events} /> : <EmptyState title="Belum ada acara" description="Buat acara pertama untuk client ini." />}<Link href={`/admin/events?clientId=${client.id}`} className="inline-block text-sm text-emerald-800 underline">Lihat semua acara client ({client._count.events})</Link></section>
  </div>;
}

export default function Page(props: Parameters<typeof PageContent>[0]) {
  return <DashboardPage><PageContent {...props} /></DashboardPage>;
}
