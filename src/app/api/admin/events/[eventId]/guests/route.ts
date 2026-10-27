import { requireApiUser } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { guestFiltersSchema, guestSchema } from "@/features/guests/validation";
import { createGuest, listGuests } from "@/features/guests/service";
import { readGuestJson } from "@/features/guests/request";

type Context = { params: Promise<{ eventId: string }> };
export async function GET(request: Request, context: Context) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    const { eventId } = await context.params;
    return apiJson(await listGuests(eventId, guestFiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
  });
}
export async function POST(request: Request, context: Context) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { eventId } = await context.params;
    const guest = await createGuest(eventId, guestSchema.parse(await readGuestJson(request)));
    return apiJson({ guest }, 201);
  });
}
