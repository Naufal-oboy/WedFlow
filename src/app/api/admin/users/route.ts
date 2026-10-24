import { prisma } from "@/lib/prisma";
import { requireApiUser, AccessError } from "@/features/auth/access";
import { createAccountSchema } from "@/features/auth/account-validation";
import { safeUserSelect } from "@/features/auth/user-select";
import { hashPassword } from "@/features/auth/password";
import { apiHandler, apiJson, requireSameOrigin } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    return apiJson({ users: await prisma.user.findMany({ select: safeUserSelect, orderBy: { createdAt: "desc" }, take: 100 }) });
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireApiUser(["SUPER_ADMIN"]);
    requireSameOrigin(request);
    const { password, ...data } = createAccountSchema.parse(await request.json());
    if (await prisma.user.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } }, select: { id: true } })) {
      throw new AccessError(409, "Akun sudah terdaftar.");
    }
    const user = await prisma.user.create({ data: { ...data, passwordHash: await hashPassword(password) }, select: safeUserSelect });
    return apiJson({ user }, 201);
  });
}
