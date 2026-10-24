"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";

export function CheckinForm({ eventId }: { eventId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/checkins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, code: data.get("code"), count: Number(data.get("count")) }) });
      const result = await response.json();
      setMessage(response.ok ? "Check-in berhasil dicatat." : result.error ?? "Check-in gagal.");
      if (response.ok) { form.reset(); router.refresh(); }
    } catch { setMessage("Koneksi terganggu. Coba lagi."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6" aria-busy={pending}>
    <h2 className="font-semibold">Check-in tamu</h2>
    <div className="space-y-2"><Label htmlFor="code">Kode undangan</Label><Input id="code" name="code" required maxLength={200} disabled={pending} /></div>
    <div className="space-y-2"><Label htmlFor="count">Jumlah tamu hadir</Label><Input id="count" name="count" type="number" min={1} max={1000} defaultValue={1} required disabled={pending} /></div>
    <Button type="submit" disabled={pending}>{pending ? "Mencatat..." : "Catat kehadiran"}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
