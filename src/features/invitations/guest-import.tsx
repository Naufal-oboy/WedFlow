"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseGuestCsv, type CsvPreview } from "./guest-csv";
import { MAX_CSV_BYTES } from "./guest-validation";

export function GuestImport({ eventId }: { eventId: string }) {
  const id = useId();
  const router = useRouter();
  const selection = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  async function selectFile(next: File | undefined) {
    const version = ++selection.current;
    setFile(null); setPreview(null); setError(""); setReading(false);
    if (!next) return;
    if (next.size > MAX_CSV_BYTES || !next.name.toLowerCase().endsWith(".csv")) { setError("Pilih file CSV maksimal 256 KB."); return; }
    setReading(true);
    try {
      const parsed = parseGuestCsv(await next.text());
      if (version !== selection.current) return;
      setFile(next); setPreview(parsed);
    } catch { if (version === selection.current) setError("File tidak dapat dibaca."); }
    finally { if (version === selection.current) setReading(false); }
  }
  async function importGuests() {
    if (!file || !preview?.guests.length || preview.errors.length) return;
    setPending(true); setError("");
    const form = new FormData(); form.set("file", file);
    try {
      const response = await fetch(`/api/admin/events/${eventId}/invitations/import`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.errors?.join(" ") ?? data.error ?? "Impor gagal.");
      toast.success(`${data.count} tamu diimpor. QR undangan siap digunakan.`);
      setFile(null); setPreview(null); if (input.current) input.current.value = "";
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Koneksi terganggu. Periksa daftar sebelum mengimpor kembali.";
      setError(message); toast.error(message);
    } finally { setPending(false); }
  }
  return <details className="rounded-lg border border-champagne bg-white p-5">
    <summary className="cursor-pointer font-medium text-primary">Impor tamu dari CSV</summary>
    <div className="mt-4 space-y-4" aria-busy={pending || reading}>
      <p className="text-sm text-muted-foreground">Gunakan header <code>guestName,guestQuota</code>. Maksimal 500 tamu dan 256 KB. Nama dengan koma harus diapit tanda kutip.</p>
      <div className="space-y-2"><Label htmlFor={id}>File CSV</Label><Input ref={input} id={id} type="file" accept=".csv,text/csv" disabled={pending} onChange={(event) => void selectFile(event.target.files?.[0])} /></div>
      {reading && <p role="status" className="text-sm">Membaca file...</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!!preview?.errors.length && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>Perbaiki CSV sebelum impor. Belum ada data yang disimpan.</p><ul className="mt-2 list-inside list-disc">{preview.errors.slice(0, 10).map((message, index) => <li key={index}>{message}</li>)}</ul>{preview.errors.length > 10 && <p>Dan {preview.errors.length - 10} kesalahan lainnya.</p>}</div>}
      {preview && !preview.errors.length && <>
        <p className="text-sm font-medium">Preview: {preview.guests.length} tamu (menampilkan maksimal 10)</p>
        <ul className="divide-y rounded-xl border border-border">{preview.guests.slice(0, 10).map((guest, index) => <li key={index} className="flex justify-between gap-4 p-3 text-sm"><span className="min-w-0 break-words">{guest.guestName}</span><span className="shrink-0">Kuota {guest.guestQuota}</span></li>)}</ul>
        <p className="text-xs text-muted-foreground">Pastikan file belum pernah diimpor. Mengimpor ulang membuat undangan baru.</p>
        <Button disabled={pending} onClick={importGuests}>{pending ? "Mengimpor..." : `Konfirmasi impor ${preview.guests.length} tamu`}</Button>
      </>}
    </div>
  </details>;
}
