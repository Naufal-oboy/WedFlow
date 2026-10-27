import { requireApiUser } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { guestSchema } from "@/features/guests/validation";
import { deleteGuest, editGuest, getGuest } from "@/features/guests/service";
import { readGuestJson } from "@/features/guests/request";

type Context = { params: Promise<{ eventId: string; guestId: string }> };
export async function GET(_request: Request, context: Context) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    const { eventId, guestId } = await context.params;
    return apiJson(await getGuest(eventId, guestId));
  });
}
export async function PATCH(request: Request, context: Context) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { eventId, guestId } = await context.params;
    return apiJson({ guest: await editGuest(eventId, guestId, guestSchema.parse(await readGuestJson(request))) });
  });
}
export async function DELETE(request: Request, context: Context) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { eventId, guestId } = await context.params;
    await deleteGuest(eventId, guestId);
    return apiJson({ success: true });
  });
}
