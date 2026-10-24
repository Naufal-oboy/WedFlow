import { EventDetail } from "@/components/dashboard/event-detail";
export default function Page({ params }: { params: Promise<{ eventId: string }> }) { return <EventDetail role="SUPER_ADMIN" params={params} />; }
