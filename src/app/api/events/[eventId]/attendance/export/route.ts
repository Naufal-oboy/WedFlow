import { requireApiUser } from "@/features/auth/access";
import { attendanceExport } from "@/features/attendance/export";
import { apiHandler } from "@/lib/api";

export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => attendanceExport(await requireApiUser(["SUPER_ADMIN", "CLIENT"]), (await context.params).eventId, request.signal));
}
