import { DashboardPage } from "@/components/dashboard/dashboard-page";
import Link from "next/link";
import { requirePageRole } from "@/features/auth/access";
import { prisma } from "@/lib/prisma";
import { EventForm } from "@/features/events/event-form";
import { single, type SearchParams } from "@/features/management/validation";
import { EmptyState, PageHeading, linkButton } from "@/components/dashboard/management-ui";

async function PageContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageRole("SUPER_ADMIN");
  const clients = await prisma.client.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } });
  const clientId = single(await searchParams, "clientId");
  return <div className="space-y-7"><PageHeading title="Tambah acara" description="Hubungkan acara dengan client, lalu tentukan jadwal dalam waktu Indonesia Barat (WIB)." />{clients.length ? <EventForm clients={clients} defaultClientId={clients.some((c) => c.id === clientId) ? clientId : ""} /> : <EmptyState title="Belum ada client aktif" description="Tambahkan atau aktifkan client sebelum membuat acara."><Link href="/admin/clients" className={linkButton}>Kelola client</Link></EmptyState>}</div>;
}

export default function Page(props: Parameters<typeof PageContent>[0]) {
  return <DashboardPage><PageContent {...props} /></DashboardPage>;
}
