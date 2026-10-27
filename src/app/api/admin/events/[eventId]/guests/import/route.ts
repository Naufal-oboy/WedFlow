import { requireApiUser } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { importSchema, MAX_CSV_BYTES } from "@/features/guests/validation";
import { importGuests } from "@/features/guests/service";
import { readGuestJson } from "@/features/guests/request";

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { eventId } = await context.params;
    // JSON escaping may expand CSV bytes; the CSV itself has an independent 256 KiB cap.
    const input = importSchema.parse(await readGuestJson(request, MAX_CSV_BYTES * 6 + 4096));
    return apiJson(await importGuests(eventId, input), input.mode === "confirm" ? 201 : 200);
  });
}
