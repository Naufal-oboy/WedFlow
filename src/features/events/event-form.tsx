"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { eventSchema, eventStatuses, slugify } from "@/features/management/validation";
import { FormField, ConfirmDialog, type FieldErrors } from "@/features/management/form-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { z } from "zod";

type EventInput = z.infer<typeof eventSchema>;
export function EventForm({ event, clients, defaultClientId = "" }: { event?: EventInput & { id: string }; clients: { id: string; name: string; status: string }[]; defaultClientId?: string }) {
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [manualSlug, setManualSlug] = useState(!!event);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<EventInput | null>(null);
  const router = useRouter();
  async function save(input: EventInput) {
    setPending(true); setErrors({}); setMessage("");
    try {
      const response = await fetch(event ? `/api/admin/events/${event.id}` : "/api/admin/events", { method: event ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) { setErrors(data.fields ?? {}); throw new Error(data.error ?? "Acara gagal disimpan."); }
      toast.success("Acara berhasil disimpan."); setConfirmation(null);
      router.push(`/admin/events/${data.event.id}`); router.refresh();
    } catch (error) { const text = error instanceof Error ? error.message : "Koneksi terganggu."; setMessage(text); toast.error(text); setConfirmation(null); }
    finally { setPending(false); }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = { ...Object.fromEntries(new FormData(e.currentTarget)), ...(event && { clientId: event.clientId }) };
    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) { setErrors(parsed.error.flatten().fieldErrors); return; }
    if (event && parsed.data.status !== event.status) setConfirmation(parsed.data);
    else void save(parsed.data);
  }
  const fieldProps = (name: string) => ({ "aria-invalid": !!errors[name], "aria-describedby": `${name}-error` });
  return <><form onSubmit={submit} aria-busy={pending} className="max-w-3xl space-y-6 rounded-lg border border-border bg-white p-6 sm:p-8"><fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><FormField name="clientId" label="Client pemilik acara" errors={errors}><select id="clientId" name="clientId" required defaultValue={event?.clientId ?? defaultClientId} disabled={!!event} className="min-h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm disabled:bg-muted" {...fieldProps("clientId")}><option value="">Pilih client aktif</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.status === "INACTIVE" ? " (nonaktif)" : ""}</option>)}</select></FormField>{event && <p className="mt-2 text-xs text-muted-foreground">Pemilik acara tetap untuk menjaga isolasi data tamu antar-client.</p>}</div>
    <div className="sm:col-span-2"><FormField name="name" label="Nama acara" errors={errors}><Input id="name" name="name" defaultValue={event?.name} required minLength={2} maxLength={160} onChange={(e) => { if (!manualSlug) setSlug(slugify(e.target.value)); }} {...fieldProps("name")} /></FormField></div>
    <div className="sm:col-span-2"><FormField name="slug" label="Slug unik" errors={errors}><Input id="slug" name="slug" value={slug} onChange={(e) => { setManualSlug(true); setSlug(e.target.value); }} required minLength={3} maxLength={100} {...fieldProps("slug")} /></FormField><p className="mt-2 text-xs text-muted-foreground">Contoh: pernikahan-ayu-bima. Slug harus berbeda untuk setiap acara.</p></div>
    <FormField name="date" label="Tanggal acara" errors={errors}><Input id="date" name="date" type="date" required min="1900-01-01" max="9999-12-31" defaultValue={event?.date} {...fieldProps("date")} /></FormField>
    <FormField name="time" label="Waktu mulai (WIB)" errors={errors}><Input id="time" name="time" type="time" required defaultValue={event?.time ?? "09:00"} {...fieldProps("time")} /></FormField>
    <div className="sm:col-span-2"><FormField name="location" label="Lokasi" errors={errors}><Input id="location" name="location" required minLength={2} maxLength={300} defaultValue={event?.location} {...fieldProps("location")} /></FormField></div>
    <FormField name="status" label="Status acara" errors={errors}><select id="status" name="status" defaultValue={event?.status ?? "DRAFT"} className="min-h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm">{Object.entries(eventStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
  </fieldset>{message && <p role="alert" className="text-sm text-red-700">{message}</p>}<div className="flex items-center gap-4"><Button type="submit" disabled={pending || !clients.length}>{pending ? "Menyimpan..." : "Simpan acara"}</Button><Link href={event ? `/admin/events/${event.id}` : "/admin/events"} className="text-sm text-muted-foreground hover:underline">Batal</Link></div></form><ConfirmDialog open={!!confirmation} onOpenChange={(open) => { if (!open) setConfirmation(null); }} pending={pending} title="Ubah status acara?" description={`Status akan diubah menjadi ${confirmation ? eventStatuses[confirmation.status] : ""}. Check-in hanya tersedia untuk acara aktif.`} onConfirm={() => { if (confirmation) void save(confirmation); }} /></>;
}
