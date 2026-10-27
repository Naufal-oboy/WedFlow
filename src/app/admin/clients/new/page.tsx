import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { requirePageRole } from "@/features/auth/access";
import { ClientForm } from "@/features/clients/client-form";
import { PageHeading } from "@/components/dashboard/management-ui";

async function PageContent() {
  await requirePageRole("SUPER_ADMIN");
  return <div className="space-y-7"><PageHeading title="Tambah client" description="Simpan identitas pasangan atau wedding organizer." /><ClientForm /></div>;
}

export default function Page() {
  return <DashboardPage><PageContent /></DashboardPage>;
}
