import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/features/auth/access";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";
import { clientSchema, listSchema } from "@/features/management/validation";
import { listClients } from "@/features/management/queries";

export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    return apiJson(await listClients(listSchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const data = clientSchema.parse(await request.json());
    return apiJson({ client: await prisma.client.create({ data }) }, 201);
  });
}
