import { apiHandler, apiJson } from "@/lib/api";
import { checkinUser, searchInvitations } from "@/features/checkins/service";
import { eventIdSchema, searchSchema } from "@/features/checkins/validation";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const user = await checkinUser();
    const params = new URL(request.url).searchParams;
    return apiJson(await searchInvitations(user, eventIdSchema.parse(params.get("eventId")), searchSchema.parse(params.get("q"))));
  });
}
