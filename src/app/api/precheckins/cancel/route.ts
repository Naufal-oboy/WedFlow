import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { readGuestJson } from "@/features/guests/request";
import { checkinUser } from "@/features/checkins/service";
import { cancelTicket } from "@/features/precheckins/service";
import { ticketActionSchema } from "@/features/precheckins/validation";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const user = await checkinUser(); requireSameOrigin(request);
    const input = ticketActionSchema.parse(await readGuestJson(request));
    return apiJson(await cancelTicket(user, input.eventId, input.requestId));
  });
}
