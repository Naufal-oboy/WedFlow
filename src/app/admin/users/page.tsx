import { requirePageRole } from "@/features/auth/access";
import { AccountManager } from "@/features/auth/account-manager";
import { prisma } from "@/lib/prisma";

export default async function Page() {
  await requirePageRole("SUPER_ADMIN");
  const [accounts, clients] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, clientId: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold text-emerald-950">Akun & akses</h1><p className="mt-3 text-sm text-stone-500">Kelola akun staff dan client. Perubahan akun mengakhiri sesi yang sedang aktif.</p></div><AccountManager accounts={accounts} clients={clients} /></div>;
}
