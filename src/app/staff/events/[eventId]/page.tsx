import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { EventDetail } from "@/components/dashboard/event-detail";
function PageContent({ params }: { params: Promise<{ eventId: string }> }) { return <EventDetail role="STAFF" params={params} />; }

export default function Page(props: Parameters<typeof PageContent>[0]) {
  return <DashboardPage><PageContent {...props} /></DashboardPage>;
}
