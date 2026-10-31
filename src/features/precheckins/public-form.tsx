"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Receipt = { queueCode: string; token: string; expiresAt: string; message: string };
export function PublicPrecheckinForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [expired, setExpired] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, new Date(receipt.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [receipt]);
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/precheckin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Permintaan belum dapat diproses.");
      setReceipt(result); setName(""); setExpired(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Koneksi terganggu. Jika sudah menerima tiket, tunjukkan kepada petugas; jika belum, coba lagi."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (receipt) return <section className="space-y-5 text-center" aria-label="Tiket sementara">
    <p role="status" className="text-sm">{receipt.message}</p><p className="text-sm text-muted-foreground">Kode antrean</p>
    <p className="break-all rounded-xl border border-champagne bg-success-soft p-5 font-mono text-3xl font-bold tracking-widest text-primary">{receipt.queueCode}</p>
    <p className="text-sm">{expired ? "Masa berlaku tiket berakhir. Hubungi petugas untuk pencarian nama secara langsung." : `Berlaku sampai ${new Date(receipt.expiresAt).toLocaleTimeString("id-ID")}. Simpan tangkapan layar kode ini.`}</p>
    <details className="text-left text-sm"><summary className="cursor-pointer py-3">Token cadangan untuk petugas</summary><p className="mb-2">Tunjukkan hanya kepada petugas acara.</p><code className="block break-all rounded-lg bg-muted p-3">{receipt.token}</code></details>
    <p className="text-xs text-muted-foreground">Petugas akan memeriksa undangan dan jumlah tamu. Tiket ini tidak menjamin akses masuk.</p>
  </section>;
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="space-y-2"><Label htmlFor="submitted-name">Nama pada undangan</Label><Input id="submitted-name" className="min-h-12" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={100} required disabled={busy} autoComplete="name" placeholder="Contoh: Budi dan keluarga" /></div>
    <p className="text-sm text-muted-foreground">Masukkan nama sesuai undangan. Setelah mendapatkan kode antrean, datangi petugas untuk verifikasi.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <Button className="min-h-12 w-full" disabled={busy || name.trim().length < 2} type="submit">{busy ? "Mengirim permintaan..." : "Lanjut"}</Button>
    <p className="text-xs text-muted-foreground">Nama digunakan untuk membantu petugas mencocokkan undangan. Tidak perlu memasukkan nomor telepon atau email.</p>
  </form>;
}
