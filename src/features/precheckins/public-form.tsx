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
  const ticketHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!receipt) return;
    ticketHeading.current?.focus();
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
    } catch (cause) { setError(cause instanceof TypeError ? "Koneksi terganggu. Periksa koneksi lalu coba lagi." : cause instanceof Error ? cause.message : "Koneksi terganggu. Jika sudah menerima tiket, tunjukkan kepada petugas; jika belum, coba lagi."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (receipt) return <section className="space-y-5" aria-label="Tiket sementara">
    <p className="eyebrow">02 / Temui petugas</p>
    <h2 ref={ticketHeading} tabIndex={-1} className="text-2xl font-semibold text-primary">Tiket sementara Anda</h2>
    <p role="status" className="text-sm leading-6">{receipt.message}</p>
    <div className="rounded-lg border border-champagne bg-card p-5 text-center"><p className="text-sm text-muted-foreground">Kode antrean</p><p className="mt-3 break-all font-mono text-3xl font-bold tracking-widest text-primary sm:text-4xl">{receipt.queueCode}</p><p className="mt-3 text-xs text-muted-foreground">Tunjukkan kode ini kepada petugas</p></div>
    <p role="status" className={`rounded-lg p-4 text-sm leading-6 ${expired ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>{expired ? "Masa berlaku tiket berakhir. Hubungi petugas untuk pencarian nama secara langsung." : `Berlaku sampai ${new Date(receipt.expiresAt).toLocaleTimeString("id-ID")}, waktu perangkat Anda. Simpan tangkapan layar kode ini.`}</p>
    <p className="border-l-2 border-champagne pl-4 text-sm font-medium leading-6">Tiket ini bukan bukti kehadiran. Verifikasi petugas tetap diperlukan.</p>
    <ol className="list-inside list-decimal space-y-2 text-sm leading-6 text-muted-foreground"><li>Datangi petugas di pintu masuk.</li><li>Tunjukkan kode antrean dan sebutkan nama undangan.</li><li>Petugas memeriksa undangan dan jumlah tamu yang datang.</li></ol>
    <details className="border-t pt-2 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">Token cadangan untuk petugas</summary><p className="mb-2">Tunjukkan hanya kepada petugas acara.</p><code className="block break-all rounded-lg bg-muted p-3">{receipt.token}</code></details>
  </section>;
  return <form className="space-y-5" aria-busy={busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <p className="eyebrow">01 / Nama undangan</p>
    <div className="space-y-3"><Label htmlFor="submitted-name">Nama pada undangan</Label><Input id="submitted-name" className="min-h-14 bg-card text-base" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={100} required disabled={busy} autoComplete="name" aria-describedby="name-help public-error" placeholder="Contoh: Budi dan keluarga" /></div>
    <p id="name-help" className="text-sm leading-6 text-muted-foreground">Masukkan nama sesuai undangan. Setelah mendapatkan kode antrean, datangi petugas untuk verifikasi.</p>
    <div id="public-error">{error && <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}</div>
    <Button className="min-h-12 w-full" disabled={busy || name.trim().length < 2} type="submit">{busy ? "Mengirim permintaan..." : "Lanjut"}</Button>
    <p className="text-xs text-muted-foreground">Nama digunakan untuk membantu petugas mencocokkan undangan. Tidak perlu memasukkan nomor telepon atau email.</p>
  </form>;
}
