import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { AdminOverview } from "@/components/dashboard/admin-overview";
function PageContent() { return <AdminOverview />; }

export default function Page() {
  return <DashboardPage><PageContent /></DashboardPage>;
}
