"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Users, Building2, UserCheck } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { roleHome } from "@/features/auth/roles";

export function DashboardNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const home = roleHome[role];
  const items = [
    { href: home, label: "Ringkasan", Icon: LayoutDashboard, active: pathname === home },
    ...(role === "SUPER_ADMIN" ? [{ href: "/admin/clients", label: "Client", Icon: Building2, active: pathname.startsWith("/admin/clients") }] : []),
    { href: role === "SUPER_ADMIN" ? "/admin/events" : `${home}#events`, label: "Acara", Icon: CalendarDays, active: pathname.startsWith(`${home}/events`) },
    ...(role === "SUPER_ADMIN" ? [
      { href: "/admin/staff", label: "Staff & penugasan", Icon: UserCheck, active: pathname.startsWith("/admin/staff") },
      { href: "/admin/users", label: "Akun & akses", Icon: Users, active: pathname.startsWith("/admin/users") },
    ] : []),
  ];
  return <nav aria-label="Navigasi dashboard" className="flex flex-wrap gap-2 lg:flex-col">{items.map(({ href, label, Icon, active }) => <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${active ? "bg-white/10 text-white" : "text-emerald-50/75 hover:bg-white/10"}`}><Icon className="size-4" />{label}</Link>)}</nav>;
}
