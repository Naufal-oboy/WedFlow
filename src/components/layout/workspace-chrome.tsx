"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Menu } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import type { Role } from "@/generated/prisma/enums";
import { roleHome, roleLabel } from "@/features/auth/roles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Brand } from "./brand";
import { DashboardNav } from "./dashboard-nav";
import { LogoutButton } from "./logout-button";

export function WorkspaceChrome({ role, name }: { role: Role; name: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const labels: Record<string, string> = { admin: "Ringkasan", client: "Ringkasan", staff: "Staff & penugasan", events: "Acara", clients: "Client", users: "Akun & akses", guests: "Tamu", new: "Tambah", edit: "Edit" };
  return <header className="sticky top-0 z-30 flex min-h-18 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-8 lg:px-10">
    <div className="flex min-w-0 items-center gap-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" size="icon" className="lg:hidden" aria-label="Buka navigasi" />}><Menu aria-hidden="true" /></DialogTrigger>
        <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-72 max-w-[calc(100%-2rem)] translate-x-0 translate-y-0 content-start rounded-none border-0 bg-sidebar p-6 text-sidebar-foreground sm:max-w-72">
          <DialogHeader><DialogTitle><Brand /></DialogTitle><DialogDescription className="text-sidebar-foreground/75">Navigasi ruang kerja {roleLabel[role]}</DialogDescription></DialogHeader>
          <div className="mt-6"><DashboardNav role={role} onNavigate={() => setOpen(false)} /></div>
        </DialogContent>
      </Dialog>
      <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li><Link className="text-muted-foreground hover:text-primary" href={roleHome[role]}>Ruang kerja</Link></li>
          {segments.slice(1).map((segment, index) => <li key={`${segment}-${index}`} className="flex items-center gap-2"><ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />{index === segments.length - 2 ? <span aria-current="page" className="font-medium">{labels[segment] ?? "Detail"}</span> : <Link className="text-muted-foreground hover:text-primary" href={`/${segments.slice(0, index + 2).join("/")}`}>{labels[segment] ?? "Detail"}</Link>}</li>)}
          {segments.length === 1 && <li className="flex items-center gap-2"><ChevronRight className="size-3" aria-hidden="true" /><span aria-current="page">Ringkasan</span></li>}
        </ol>
      </nav>
    </div>
    <Popover.Root>
      <Popover.Trigger render={<Button variant="ghost" className="h-auto min-h-11 max-w-52 gap-2 px-2" aria-label={`Menu akun ${name}`} />}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
        <span className="hidden min-w-0 text-left sm:block"><span className="block truncate text-sm">{name}</span><span className="block text-xs font-normal text-muted-foreground">{roleLabel[role]}</span></span><ChevronDown className="size-3" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal><Popover.Positioner sideOffset={8} align="end" className="z-50"><Popover.Popup className="w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md">
        <Popover.Title className="break-words font-medium">{name}</Popover.Title><Popover.Description className="mb-4 mt-1 text-sm text-muted-foreground">{roleLabel[role]}</Popover.Description><LogoutButton />
      </Popover.Popup></Popover.Positioner></Popover.Portal>
    </Popover.Root>
  </header>;
}
