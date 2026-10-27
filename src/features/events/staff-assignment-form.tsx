"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/features/management/form-ui";

export function StaffAssignmentForm({ eventId, staff, assignedIds, inactive = false }: { eventId: string; staff: { id: string; name: string; email: string }[]; assignedIds: string[]; inactive?: boolean }) {
  const [selected, setSelected] = useState(assignedIds);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const removed = assignedIds.filter((id) => !selected.includes(id));
  const changed = selected.length !== assignedIds.length || removed.length > 0;
  async function save() {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${eventId}/staff`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: selected }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Penugasan gagal.");
      toast.success("Penugasan berhasil disimpan."); setConfirm(false); router.refresh();
    } catch (error) { const text = error instanceof Error ? error.message : "Koneksi terganggu. Coba lagi."; setMessage(text); toast.error(text); }
    finally { setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (removed.length) setConfirm(true); else void save(); }
  const visible = staff.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  return <><form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6" aria-busy={pending}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Petugas acara</h2><span className="text-xs text-stone-500">{selected.length} dipilih</span></div><p className="text-sm text-stone-500">Pilih staff untuk memberi akses. Hapus centang untuk mencabut penugasan.</p>
    {staff.length > 0 && <Input aria-label="Cari petugas" placeholder="Cari nama atau email staff" value={search} onChange={(e) => setSearch(e.target.value)} />}
    <fieldset disabled={pending} className="max-h-72 space-y-3 overflow-y-auto"><legend className="sr-only">Pilih petugas acara</legend>{visible.map((user) => <label key={user.id} className="flex items-center gap-3 rounded-lg border border-stone-100 p-3 text-sm"><input type="checkbox" value={user.id} checked={selected.includes(user.id)} disabled={inactive && !assignedIds.includes(user.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, user.id] : ids.filter((id) => id !== user.id))} className="size-4 accent-emerald-800" /><span>{user.name}<span className="block break-all text-xs text-stone-500">{user.email}</span></span></label>)}{!visible.length && <p className="text-sm text-stone-500">{staff.length ? "Tidak ada staff sesuai pencarian." : "Belum ada akun staff."} <Link href="/admin/users" className="text-emerald-800 underline">Kelola akun</Link></p>}</fieldset>
    <Button type="submit" disabled={pending || !changed || selected.length > 100}>{pending ? "Menyimpan..." : "Simpan penugasan"}</Button>{selected.length > 100 && <p role="alert" className="text-sm text-red-700">Maksimal 100 petugas per acara.</p>}{message && <p role="alert" className="text-sm text-red-700">{message}</p>}
  </form><ConfirmDialog open={confirm} onOpenChange={setConfirm} pending={pending} onConfirm={save} title="Cabut penugasan staff?" description={`${removed.length} staff akan langsung kehilangan akses ke acara ini. Penugasan mereka di acara lain tetap berlaku.`} /></>;
}
