import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { readGuestJson } from "@/features/guests/request";
import { checkinUser, verifyInvitation } from "@/features/checkins/service";
import { verifySchema } from "@/features/checkins/validation";

export async function POST(request: Request) {
  return apiHandler(async () => {
    const user = await checkinUser();
    requireSameOrigin(request);
    return apiJson(await verifyInvitation(user, verifySchema.parse(await readGuestJson(request))));
  });
}
