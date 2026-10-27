import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/features/auth/access";
import { prisma } from "@/lib/prisma";
import { EventForm } from "@/features/events/event-form";
import { localEventInputs, eventStatuses } from "@/features/management/validation";
import { PageHeading } from "@/components/dashboard/management-ui";

async function PageContent({ params }: { params: Promise<{ eventId: string }> }) {
  await requirePageRole("SUPER_ADMIN");
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { client: { select: { id: true, name: true, status: true } } } });
  if (!event) notFound();
  return <div className="space-y-7"><PageHeading title="Edit acara" description="Perbarui informasi acara. Penugasan staff dan riwayat tamu tetap tersimpan." />{!(event.status in eventStatuses) && <p role="status" className="text-sm text-amber-800">Status lama: {event.status}. Pilih status yang berlaku sebelum menyimpan.</p>}<EventForm clients={[event.client]} event={{ id: event.id, clientId: event.clientId, name: event.name, slug: event.slug, location: event.location ?? "", status: event.status as keyof typeof eventStatuses, ...localEventInputs(event.eventDate) }} /></div>;
}

export default function Page(props: Parameters<typeof PageContent>[0]) {
  return <DashboardPage><PageContent {...props} /></DashboardPage>;
}
