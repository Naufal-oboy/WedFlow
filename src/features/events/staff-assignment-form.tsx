"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function StaffAssignmentForm({ eventId, staff, assignedIds }: { eventId: string; staff: { id: string; name: string }[]; assignedIds: string[] }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userIds = new FormData(event.currentTarget).getAll("userId");
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${eventId}/staff`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds }) });
      const result = await response.json();
      setMessage(response.ok ? "Penugasan berhasil disimpan." : result.error ?? "Penugasan gagal.");
      if (response.ok) router.refresh();
    } catch { setMessage("Koneksi terganggu. Coba lagi."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6" aria-busy={pending}>
    <fieldset disabled={pending} className="space-y-3"><legend className="mb-3 font-semibold">Petugas acara</legend>
      {staff.length ? staff.map((user) => <label key={user.id} className="flex items-center gap-3 text-sm"><input type="checkbox" name="userId" value={user.id} defaultChecked={assignedIds.includes(user.id)} className="size-4 accent-emerald-800" />{user.name}</label>) : <p className="text-sm text-stone-500">Buat akun staff melalui menu Akun & akses terlebih dahulu.</p>}
    </fieldset>
    <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan penugasan"}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
