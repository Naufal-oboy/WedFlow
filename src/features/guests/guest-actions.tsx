"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog, FormField, type FieldErrors } from "@/features/management/form-ui";

type EditableGuest = { id: string; guestName: string; guestQuota: number; checkedInCount: number | null };
export function GuestFormDialog({ eventId, guest }: { eventId: string; guest?: EditableGuest }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setErrors({}); setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${eventId}/guests${guest ? `/${guest.id}` : ""}`, {
        method: guest ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName: form.get("guestName"), guestQuota: Number(form.get("guestQuota")) }),
      });
      const data = await response.json();
      if (!response.ok) { setErrors(data.fields ?? {}); throw new Error(data.error ?? "Undangan gagal disimpan."); }
      toast.success(guest ? "Undangan berhasil diperbarui." : "Tamu berhasil ditambahkan.");
      setOpen(false); router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Koneksi terganggu.";
      setMessage(text); toast.error(text);
    } finally { setPending(false); }
  }
  return <>
    <Button variant={guest ? "outline" : "default"} onClick={() => { setErrors({}); setMessage(""); setOpen(true); }} aria-label={guest ? `Edit ${guest.guestName}` : undefined}>{guest ? "Edit" : "Tambah tamu"}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <DialogContent className="wedflow-theme" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>{guest ? "Edit undangan" : "Tambah tamu"}</DialogTitle><DialogDescription>{guest ? "Perbarui nama dan kuota. Kode undangan dan riwayat check-in tetap tersimpan." : "Kode undangan unik dibuat otomatis setelah tamu disimpan."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <FormField name="guestName" label="Nama tamu" errors={errors}><Input id="guestName" name="guestName" defaultValue={guest?.guestName ?? ""} required maxLength={150} disabled={pending} aria-invalid={!!errors.guestName} aria-describedby={errors.guestName ? "guestName-error" : undefined} /></FormField>
          <FormField name="guestQuota" label="Kuota undangan" errors={errors}><Input id="guestQuota" name="guestQuota" type="number" min={Math.max(1, guest?.checkedInCount ?? 0)} max={1000} step={1} defaultValue={guest?.guestQuota ?? 1} required disabled={pending} aria-invalid={!!errors.guestQuota} aria-describedby={errors.guestQuota ? "guestQuota-error" : undefined} /></FormField>
          {!!guest?.checkedInCount && <p className="text-sm text-muted-foreground">Sudah tercatat {guest.checkedInCount} tamu hadir. Kuota minimal {guest.checkedInCount}.</p>}
          {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
          <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan undangan"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

export function DeleteGuestButton({ eventId, guestId, guestName, checkedIn, returnToList = false }: { eventId: string; guestId: string; guestName: string; checkedIn: boolean; returnToList?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function remove() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/events/${eventId}/guests/${guestId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Undangan gagal dihapus.");
      toast.success("Undangan berhasil dihapus."); setOpen(false);
      if (returnToList) router.push(`/admin/events/${eventId}/guests`);
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Koneksi terganggu."); }
    finally { setPending(false); }
  }
  return <>
    <Button variant="destructive" disabled={checkedIn} title={checkedIn ? "Undangan sudah check-in dan tidak dapat dihapus." : undefined} aria-label={`Hapus ${guestName}`} onClick={() => setOpen(true)}>Hapus</Button>
    <ConfirmDialog open={open} onOpenChange={setOpen} pending={pending} onConfirm={remove} title="Hapus undangan?" description={`Undangan untuk ${guestName} akan dihapus permanen dan kodenya tidak dapat digunakan lagi. Tindakan ini hanya berlaku untuk undangan yang belum check-in.`} />
  </>;
}
