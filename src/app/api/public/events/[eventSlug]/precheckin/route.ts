import { apiHandler, apiJson } from "@/lib/api";
import { AccessError } from "@/lib/access-error";
import { readGuestJson } from "@/features/guests/request";
import { publicOrigin } from "@/features/precheckins/ticket";
import { limitPublicRequest } from "@/features/precheckins/rate-limit";
import { slugSchema, submitSchema } from "@/features/precheckins/validation";
import { submitRequest } from "@/features/precheckins/service";

export async function POST(request: Request, context: { params: Promise<{ eventSlug: string }> }) {
  const response = await apiHandler(async () => {
    if (request.headers.get("origin") !== publicOrigin() || request.headers.get("sec-fetch-site") === "cross-site") throw new AccessError(403, "Asal permintaan tidak diizinkan.");
    await limitPublicRequest(request);
    const { eventSlug } = await context.params;
    const { name } = submitSchema.parse(await readGuestJson(request, 2048));
    const response = apiJson(await submitRequest(slugSchema.parse(eventSlug), name), 201);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  });
  if (response.status === 429) response.headers.set("Retry-After", "600");
  return response;
}
