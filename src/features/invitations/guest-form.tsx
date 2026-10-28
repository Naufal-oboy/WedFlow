"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { guestSchema } from "./guest-validation";

export function GuestForm({ eventId, guest }: { eventId: string; guest?: { id: string; guestName: string; guestQuota: number } }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = guestSchema.safeParse({ guestName: form.get("guestName"), guestQuota: Number(form.get("guestQuota")) });
    if (!parsed.success) { setError(parsed.error.issues.map(({ message }) => message).join(" ")); return; }
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/admin/events/${eventId}/invitations${guest ? `/${guest.id}` : ""}`, {
        method: guest ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Data tamu gagal disimpan.");
      toast.success(guest ? "Data tamu diperbarui. QR tetap sama." : "Tamu ditambahkan. QR undangan siap digunakan.");
      setOpen(false); router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Koneksi terganggu. Periksa daftar sebelum mencoba kembali.";
      setError(message); toast.error(message);
    } finally { setPending(false); }
  }
  return <>
    <Button variant={guest ? "outline" : "default"} onClick={() => { setError(""); setOpen(true); }}>{guest ? "Edit tamu" : "Tambah tamu"}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <DialogContent className="wedflow-theme" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>{guest ? "Edit tamu" : "Tambah tamu"}</DialogTitle><DialogDescription>{guest ? "Perubahan nama dan kuota tidak mengganti QR undangan." : "Satu undangan untuk individu atau rombongan dengan kuota yang ditentukan."}</DialogDescription></DialogHeader>
        {open && <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
          <div className="space-y-2"><Label htmlFor={`${id}-name`}>Nama tamu</Label><Input id={`${id}-name`} name="guestName" maxLength={160} required defaultValue={guest?.guestName ?? ""} disabled={pending} /></div>
          <div className="space-y-2"><Label htmlFor={`${id}-quota`}>Kuota undangan</Label><Input id={`${id}-quota`} name="guestQuota" type="number" min={1} max={1000} required defaultValue={guest?.guestQuota ?? 1} disabled={pending} /></div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={pending}>Batal</Button><Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan tamu"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
