import { apiHandler, apiJson } from "@/lib/api";
import { getAccessibleEvent } from "@/features/events/queries";
export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => apiJson({ event: await getAccessibleEvent((await context.params).eventId) }));
}
