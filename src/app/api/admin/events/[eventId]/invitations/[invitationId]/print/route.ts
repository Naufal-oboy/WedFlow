import { apiHandler } from "@/lib/api";
import { getQrInvitation } from "@/features/invitations/qr-access";
import { invitationPrintResponse } from "@/features/invitations/print";

export async function GET(_request: Request, context: { params: Promise<{ eventId: string; invitationId: string }> }) {
  return apiHandler(async () => {
    const { eventId, invitationId } = await context.params;
    return invitationPrintResponse(await getQrInvitation(eventId, invitationId));
  });
}
