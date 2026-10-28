import { apiHandler, apiJson } from "@/lib/api";
import { getQrInvitation } from "@/features/invitations/qr-access";
import { invitationFilename, invitationPng } from "@/features/invitations/qr";

export async function GET(request: Request, context: { params: Promise<{ eventId: string; invitationId: string }> }) {
  return apiHandler(async () => {
    const { eventId, invitationId } = await context.params;
    const invitation = await getQrInvitation(eventId, invitationId);
    const png = await invitationPng(invitation.code);
    if (new URL(request.url).searchParams.get("download") === "1") {
      return new Response(new Uint8Array(png), { headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${invitationFilename(invitation.id)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      } });
    }
    return apiJson({ invitation, pngDataUrl: `data:image/png;base64,${png.toString("base64")}` });
  });
}
