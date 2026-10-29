import { apiHandler, apiJson } from "@/lib/api";
import { checkinUser, invitationDetail } from "@/features/checkins/service";
import { eventIdSchema } from "@/features/checkins/validation";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const user = await checkinUser();
    const params = new URL(request.url).searchParams;
    return apiJson(await invitationDetail(user, eventIdSchema.parse(params.get("eventId")), eventIdSchema.parse(params.get("invitationId"))));
  });
}
