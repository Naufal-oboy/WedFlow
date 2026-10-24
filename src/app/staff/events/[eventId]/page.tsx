import { EventDetail } from "@/components/dashboard/event-detail";
export default function Page({ params }: { params: Promise<{ eventId: string }> }) { return <EventDetail role="STAFF" params={params} />; }
