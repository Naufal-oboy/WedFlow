import { z } from "zod";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { parseGuestCsv } from "@/features/invitations/guest-csv";
import { MAX_CSV_BYTES } from "@/features/invitations/guest-validation";
import { generateInvitationCode } from "@/features/invitations/qr";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return apiHandler(async () => {
    const user = await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const eventId = z.uuid().parse((await context.params).eventId);
    if (!await prisma.event.findFirst({ where: { AND: [{ id: eventId }, eventScope(user)] }, select: { id: true } })) throw new AccessError(404, "Acara tidak ditemukan.");
    // Bound the actual stream, not only Content-Length (which may be absent/spoofed).
    const limit = MAX_CSV_BYTES + 16 * 1024;
    if (Number(request.headers.get("content-length")) > limit) throw new AccessError(413, "File CSV terlalu besar.");
    if (!request.body) throw new AccessError(400, "Pilih file CSV.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) { await reader.cancel(); throw new AccessError(413, "File CSV terlalu besar."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); }
    catch { throw new AccessError(400, "Unggah file melalui form CSV yang valid."); }
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) throw new AccessError(400, "Pilih file berformat CSV.");
    if (file.size > MAX_CSV_BYTES) throw new AccessError(413, "File CSV maksimal 256 KB.");
    const preview = parseGuestCsv(await file.text());
    if (preview.errors.length) return apiJson({ error: "Impor dibatalkan. Perbaiki CSV terlebih dahulu.", errors: preview.errors }, 400);
    // createMany is atomic: no partial import and no skipDuplicates hiding failures.
    const result = await prisma.invitation.createMany({ data: preview.guests.map((guest) => ({ ...guest, eventId, code: generateInvitationCode() })) });
    return apiJson({ count: result.count }, 201);
  });
}
