import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { Overview } from "@/components/dashboard/overview";
function PageContent() { return <Overview role="STAFF" />; }

export default function Page() {
  return <DashboardPage><PageContent /></DashboardPage>;
}
