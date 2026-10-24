"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Users } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { roleHome } from "@/features/auth/roles";

export function DashboardNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const home = roleHome[role];
  return <nav aria-label="Navigasi dashboard" className="flex flex-wrap gap-2 lg:flex-col">
    <Link href={home} aria-current={pathname === home ? "page" : undefined} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm text-white"><LayoutDashboard className="size-4" /> Ringkasan</Link>
    <Link href={`${home}#events`} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-emerald-50/75 hover:bg-white/10"><CalendarDays className="size-4" /> Acara</Link>
    {role === "SUPER_ADMIN" && <Link href="/admin/users" aria-current={pathname === "/admin/users" ? "page" : undefined} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-emerald-50/75 hover:bg-white/10"><Users className="size-4" /> Akun & akses</Link>}
  </nav>;
}
