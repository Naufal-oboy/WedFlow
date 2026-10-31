import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { eventStatuses, formatEventDate, type SearchParams } from "@/features/management/validation";

export const linkButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const selectClass = "min-h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";
export function PageHeading({ title, description, children, editorial = false, eyebrow }: { title: string; description: string; children?: ReactNode; editorial?: boolean; eyebrow?: string }) {
  return <header className="flex flex-wrap items-end justify-between gap-5"><div className="min-w-0">{eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}<h1 className={editorial ? "editorial-title" : "text-2xl font-semibold tracking-tight text-primary sm:text-3xl"}>{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{children}</header>;
}
export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="surface px-6 py-12 text-center"><h2 className="font-semibold text-primary">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{children && <div className="mt-6">{children}</div>}</div>;
}
export function StatusBadge({ status }: { status: string }) {
  const label = status === "INACTIVE" ? "Nonaktif" : eventStatuses[status as keyof typeof eventStatuses] ?? status;
  return <Badge variant="outline" className={status === "ACTIVE" ? "border-success/20 bg-success-soft text-success" : status === "DRAFT" ? "border-warning/20 bg-warning-soft text-warning" : "border-border bg-muted text-muted-foreground"}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{label}</Badge>;
}
export function Pagination({ base, params, total, page, pageSize = 12 }: { base: string; params: SearchParams; total: number; page: number; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  function href(target: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value && key !== "page") query.set(key, value);
    query.set("page", String(target));
    return `${base}?${query}`;
  }
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-4 text-sm"><p className="text-muted-foreground">{total} hasil · Halaman {page} dari {pages}</p><div className="flex gap-4">{page > 1 && <Link className="text-primary underline underline-offset-4" href={href(page - 1)}>Sebelumnya</Link>}{page < pages && <Link className="text-primary underline underline-offset-4" href={href(page + 1)}>Berikutnya</Link>}</div></nav>;
}
export function EventTable({ events }: { events: { id: string; name: string; slug: string; status: string; eventDate: Date; location: string | null; client: { name: string } }[] }) {
  return <div className="overflow-hidden rounded-xl border border-border bg-white"><Table><TableHeader><TableRow><TableHead>Acara / client</TableHead><TableHead>Jadwal (WIB)</TableHead><TableHead>Lokasi</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={event.id}><TableCell className="min-w-44 max-w-64 whitespace-normal"><Link className="font-medium text-primary hover:underline" href={`/admin/events/${event.id}`}>{event.name}</Link><p className="mt-1 text-xs text-muted-foreground">{event.client.name}</p></TableCell><TableCell className="min-w-40 whitespace-normal">{formatEventDate(event.eventDate)}</TableCell><TableCell className="max-w-52 whitespace-normal">{event.location || "Belum ditentukan"}</TableCell><TableCell><StatusBadge status={event.status} /></TableCell><TableCell><Link className="text-primary hover:underline" href={`/admin/events/${event.id}/edit`} aria-label={`Edit ${event.name}`}>Edit</Link></TableCell></TableRow>)}</TableBody></Table></div>;
}
