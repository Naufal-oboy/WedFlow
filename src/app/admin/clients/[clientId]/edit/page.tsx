import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/features/auth/access";
import { prisma } from "@/lib/prisma";
import { ClientForm } from "@/features/clients/client-form";
import { PageHeading } from "@/components/dashboard/management-ui";

async function PageContent({ params }: { params: Promise<{ clientId: string }> }) {
  await requirePageRole("SUPER_ADMIN");
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) notFound();
  return <div className="space-y-7"><PageHeading title="Edit client" description="Perbarui informasi kontak dan jenis pelanggan." /><ClientForm client={client} /></div>;
}

export default function Page(props: Parameters<typeof PageContent>[0]) {
  return <DashboardPage><PageContent {...props} /></DashboardPage>;
}
