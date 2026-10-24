import { apiHandler, apiJson } from "@/lib/api";
import { listAccessibleEvents } from "@/features/events/queries";
export async function GET() { return apiHandler(async () => apiJson({ events: await listAccessibleEvents() })); }
