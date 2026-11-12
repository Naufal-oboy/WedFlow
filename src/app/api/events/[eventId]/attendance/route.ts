import { requireApiUser } from "@/features/auth/access";
import { attendanceSnapshot } from "@/features/attendance/service";
import { apiHandler, apiJson } from "@/lib/api";

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => {
    const user = await requireApiUser();
    return apiJson(await attendanceSnapshot(user, (await context.params).eventId));
  });
}
