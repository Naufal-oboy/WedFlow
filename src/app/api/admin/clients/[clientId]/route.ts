import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { clientSchema } from "@/features/management/validation";

type Context = { params: Promise<{ clientId: string }> };
export async function GET(_request: Request, context: Context) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    const { clientId } = await context.params;
    const client = await prisma.client.findUnique({ where: { id: clientId }, include: { _count: { select: { events: true, users: true } } } });
    if (!client) throw new AccessError(404, "Client tidak ditemukan.");
    return apiJson({ client });
  });
}
export async function PATCH(request: Request, context: Context) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { clientId } = await context.params;
    const data = clientSchema.parse(await request.json());
    return apiJson({ client: await prisma.client.update({ where: { id: clientId }, data }) });
  });
}
