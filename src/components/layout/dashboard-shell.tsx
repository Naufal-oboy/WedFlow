import { Suspense, type ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/features/auth/access";
import { roleLabel } from "@/features/auth/roles";
import { Brand } from "./brand";
import { DashboardNav } from "./dashboard-nav";
import { WorkspaceChrome } from "./workspace-chrome";

export function DashboardShell({ role, children }: { role: Role; children: ReactNode }) {
  return <Suspense fallback={<main role="status" className="grid min-h-screen place-items-center bg-background text-muted-foreground">Memuat ruang kerja...</main>}><AuthorizedShell role={role}>{children}</AuthorizedShell></Suspense>;
}
async function AuthorizedShell({ role, children }: { role: Role; children: ReactNode }) {
  const user = await requirePageRole(role);
  return <div className="wedflow-theme min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
    <a href="#main-content" className="skip-link">Lewati ke konten utama</a>
    <aside className="sticky top-0 hidden h-dvh flex-col bg-sidebar px-4 py-8 text-sidebar-foreground lg:flex">
      <div className="px-3"><Brand /><p className="mt-3 text-xs text-sidebar-foreground/70">{roleLabel[role]} workspace</p></div>
      <div className="mt-12"><p className="mb-3 px-4 text-[10px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/65">Ruang kerja</p><DashboardNav role={role} /></div>
      <div className="mt-auto border-t border-sidebar-border px-3 pt-6"><p className="font-editorial-heading text-2xl text-champagne">Every guest matters.</p><p className="mt-2 text-xs text-sidebar-foreground/70">Wedding guest management</p></div>
    </aside>
    <div className="min-w-0">
      <WorkspaceChrome role={role} name={user.name ?? roleLabel[role]} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-8 sm:py-8 lg:p-10">{children}</main>
    </div>
  </div>;
}
