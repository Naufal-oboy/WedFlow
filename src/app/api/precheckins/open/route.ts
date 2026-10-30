import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { readGuestJson } from "@/features/guests/request";
import { checkinUser } from "@/features/checkins/service";
import { openTicket } from "@/features/precheckins/service";
import { lookupSchema } from "@/features/precheckins/validation";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const user = await checkinUser(); requireSameOrigin(request);
    const input = lookupSchema.parse(await readGuestJson(request));
    return apiJson(await openTicket(user, input.eventId, input.lookup));
  });
}
