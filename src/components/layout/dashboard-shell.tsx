import { Suspense, type ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/features/auth/access";
import { roleLabel } from "@/features/auth/roles";
import { Brand } from "./brand";
import { DashboardNav } from "./dashboard-nav";
import { LogoutButton } from "./logout-button";

export function DashboardShell({ role, children }: { role: Role; children: ReactNode }) {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#faf8f2]">Memuat ruang kerja...</main>}><AuthorizedShell role={role}>{children}</AuthorizedShell></Suspense>;
}
async function AuthorizedShell({ role, children }: { role: Role; children: ReactNode }) {
  const user = await requirePageRole(role);
  return <div className="wedflow-theme min-h-screen bg-[#faf8f2] text-stone-800 lg:grid lg:grid-cols-[248px_1fr]">
    <aside className="flex flex-col gap-6 bg-[#123e32] px-5 py-6 text-white lg:sticky lg:top-0 lg:h-screen lg:gap-12 lg:p-7">
      <Brand /><DashboardNav role={role} />
      <p className="mt-auto hidden border-t border-white/10 pt-6 text-xs leading-6 text-emerald-50/50 lg:block">Ruang untuk setiap momen.<br />WedFlow workspace</p>
    </aside>
    <div className="min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white/70 px-6 py-5 sm:px-10">
        <div><p className="text-xs text-stone-500">Ruang kerja {roleLabel[user.role]}</p><p className="mt-1 font-medium text-emerald-950">{user.name}</p></div>
        <div className="flex items-center gap-3"><span className="hidden rounded-full bg-[#f1ead7] px-3 py-1 text-xs text-[#73603b] sm:inline">{roleLabel[user.role]}</span><LogoutButton /></div>
      </header>
      <main className="mx-auto max-w-7xl p-6 sm:p-10">{children}</main>
    </div>
  </div>;
}
