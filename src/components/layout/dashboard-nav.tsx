"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CalendarDays, LayoutDashboard, Users, Building2, UserCheck } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { roleHome } from "@/features/auth/roles";

const subscribe = (callback: () => void) => { window.addEventListener("hashchange", callback); window.addEventListener("popstate", callback); return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); }; };
export function DashboardNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const home = roleHome[role];
  const items = [
    { href: home, label: "Ringkasan", Icon: LayoutDashboard, active: pathname === home && hash !== "#events" },
    ...(role === "SUPER_ADMIN" ? [{ href: "/admin/clients", label: "Client", Icon: Building2, active: pathname.startsWith("/admin/clients") }] : []),
    { href: role === "SUPER_ADMIN" ? "/admin/events" : `${home}#events`, label: "Acara", Icon: CalendarDays, active: pathname.startsWith(`${home}/events`) || (pathname === home && hash === "#events") },
    ...(role === "SUPER_ADMIN" ? [
      { href: "/admin/staff", label: "Staff & penugasan", Icon: UserCheck, active: pathname.startsWith("/admin/staff") },
      { href: "/admin/users", label: "Akun & akses", Icon: Users, active: pathname.startsWith("/admin/users") },
    ] : []),
  ];
  return <nav aria-label="Navigasi dashboard" className="flex flex-col gap-1">{items.map(({ href, label, Icon, active }) => { const NavLink = role !== "SUPER_ADMIN" && pathname === home ? "a" : Link; return <NavLink key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-md border-l-2 px-4 py-3 text-sm transition-colors focus-visible:outline-sidebar-ring ${active ? "border-champagne bg-sidebar-accent font-medium text-sidebar-foreground" : "border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}><Icon className="size-4 shrink-0" aria-hidden="true" />{label}</NavLink>; })}</nav>;
}
