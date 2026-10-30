import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { requireApiUser } from "@/features/auth/access";
import { prisma } from "@/lib/prisma";
import { AccessError } from "@/lib/access-error";
import { publicQrPng, publicQrPrint } from "@/features/precheckins/qr";
export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    const eventId = z.uuid().parse((await context.params).eventId);
    const event = await prisma.event.findFirst({ where: { id: eventId, status: "ACTIVE", client: { status: "ACTIVE" } }, select: { name: true, slug: true } });
    if (!event) throw new AccessError(404, "QR publik hanya tersedia untuk acara dan client aktif.");
    if (new URL(request.url).searchParams.get("download") === "1") return new Response(new Uint8Array(await publicQrPng(event.slug)), { headers: {
      "Content-Type": "image/png", "Content-Disposition": `attachment; filename="wedflow-public-${eventId}.png"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
    return publicQrPrint(event);
  });
}
