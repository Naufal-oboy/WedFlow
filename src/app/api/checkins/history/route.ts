import { z } from "zod";
import { apiHandler, apiJson } from "@/lib/api";
import { checkinUser, checkinHistory } from "@/features/checkins/service";
import { eventIdSchema } from "@/features/checkins/validation";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const user = await checkinUser();
    const params = new URL(request.url).searchParams;
    return apiJson(await checkinHistory(user, eventIdSchema.parse(params.get("eventId")), eventIdSchema.optional().parse(params.get("invitationId") ?? undefined), z.string().min(1).max(100).optional().parse(params.get("cursor") ?? undefined)));
  });
}
