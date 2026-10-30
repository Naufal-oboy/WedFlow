import { z } from "zod";
import { apiHandler, apiJson } from "@/lib/api";
import { checkinUser } from "@/features/checkins/service";
import { listTickets } from "@/features/precheckins/service";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const user = await checkinUser();
    const params = new URL(request.url).searchParams;
    return apiJson(await listTickets(user, z.uuid().parse(params.get("eventId")), z.enum(["PENDING", "VERIFIED", "CANCELLED", "EXPIRED"]).parse(params.get("status") ?? "PENDING"), z.uuid().optional().parse(params.get("cursor") ?? undefined)));
  });
}
