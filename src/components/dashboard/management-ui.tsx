import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { eventStatuses, formatEventDate, type SearchParams } from "@/features/management/validation";

export const linkButton = "inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800";
export const selectClass = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#9b824c]">WedFlow management</p><h1 className="text-3xl font-semibold tracking-tight text-emerald-950">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">{description}</p></div>{children}</header>;
}
export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="space-y-4 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-6 py-14 text-center"><CalendarDays className="mx-auto size-8 text-[#b49b64]" /><h2 className="font-semibold text-emerald-950">{title}</h2><p className="text-sm text-stone-500">{description}</p>{children}</div>;
}
export function StatusBadge({ status }: { status: string }) {
  const label = status === "INACTIVE" ? "Nonaktif" : eventStatuses[status as keyof typeof eventStatuses] ?? status;
  return <Badge variant="outline" className={status === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-stone-50 text-stone-600"}>{label}</Badge>;
}
export function Pagination({ base, params, total, page, pageSize = 12 }: { base: string; params: SearchParams; total: number; page: number; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  function href(target: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value && key !== "page") query.set(key, value);
    query.set("page", String(target));
    return `${base}?${query}`;
  }
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-4 text-sm"><p className="text-stone-500">{total} hasil · Halaman {page} dari {pages}</p><div className="flex gap-4">{page > 1 && <Link className="text-emerald-800 underline underline-offset-4" href={href(page - 1)}>Sebelumnya</Link>}{page < pages && <Link className="text-emerald-800 underline underline-offset-4" href={href(page + 1)}>Berikutnya</Link>}</div></nav>;
}
export function EventTable({ events }: { events: { id: string; name: string; slug: string; status: string; eventDate: Date; location: string | null; client: { name: string } }[] }) {
  return <div className="overflow-hidden rounded-xl border border-stone-200 bg-white"><Table><TableHeader><TableRow><TableHead>Acara / client</TableHead><TableHead>Jadwal (WIB)</TableHead><TableHead>Lokasi</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={event.id}><TableCell><Link className="font-medium text-emerald-900 hover:underline" href={`/admin/events/${event.id}`}>{event.name}</Link><p className="mt-1 text-xs text-stone-500">{event.client.name}</p></TableCell><TableCell>{formatEventDate(event.eventDate)}</TableCell><TableCell className="max-w-52 whitespace-normal">{event.location || "Belum ditentukan"}</TableCell><TableCell><StatusBadge status={event.status} /></TableCell><TableCell><Link className="text-emerald-800 hover:underline" href={`/admin/events/${event.id}/edit`} aria-label={`Edit ${event.name}`}>Edit</Link></TableCell></TableRow>)}</TableBody></Table></div>;
}
