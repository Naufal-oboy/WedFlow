import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { readGuestJson } from "@/features/guests/request";
import { checkinUser } from "@/features/checkins/service";
import { verifyTicket } from "@/features/precheckins/service";
import { ticketVerifySchema } from "@/features/precheckins/validation";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const user = await checkinUser(); requireSameOrigin(request);
    const input = ticketVerifySchema.parse(await readGuestJson(request));
    return apiJson(await verifyTicket(user, input.eventId, input.requestId, input.invitationId));
  });
}
