"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MAX_CSV_BYTES } from "./validation";
import { safePreviewCell, type CsvPreview } from "./csv";

export function ImportGuestDialog({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<(CsvPreview & { token: string }) | null>(null);
  const [csv, setCsv] = useState("");
  const [duplicates, setDuplicates] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function request(body: object) {
    const response = await fetch(`/api/admin/events/${eventId}/guests/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Impor belum dapat diproses.");
    return data;
  }
  async function showPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file");
    setError(""); setPreview(null); setDuplicates(false); setPending(true);
    try {
      if (!(file instanceof File) || !file.size) throw new Error("Pilih file CSV terlebih dahulu.");
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Pilih file dengan ekstensi .csv.");
      if (file.size > MAX_CSV_BYTES) throw new Error("Ukuran CSV maksimal 256 KiB.");
      let content;
      try { content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error("File harus menggunakan encoding UTF-8 yang valid."); }
      const data = await request({ mode: "preview", csv: content });
      setCsv(content); setPreview(data);
    } catch (error) { setError(error instanceof Error ? error.message : "Koneksi terganggu."); }
    finally { setPending(false); }
  }
  async function confirm() {
    if (!preview || pending) return;
    setPending(true); setError("");
    try {
      const result = await request({ mode: "confirm", csv, token: preview.token, allowDuplicateNames: duplicates });
      toast.success(`${result.imported} tamu berhasil diimpor.`);
      setPreview(null); setCsv(""); setOpen(false); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Koneksi terganggu."); }
    finally { setPending(false); }
  }
  return <>
    <Button variant="outline" onClick={() => { setPreview(null); setCsv(""); setError(""); setDuplicates(false); setOpen(true); }}>Impor CSV</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <DialogContent className="wedflow-theme max-h-[90dvh] overflow-y-auto sm:max-w-4xl" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>Impor daftar tamu</DialogTitle><DialogDescription>CSV UTF-8, maksimal 256 KiB dan 500 baris. Periksa preview lalu konfirmasi untuk menyimpan seluruh data.</DialogDescription></DialogHeader>
        <div className="rounded-lg bg-warning-soft p-3 text-sm text-stone-700"><p>Gunakan pemisah koma dengan format:</p><pre className="mt-2 overflow-x-auto text-xs">{"guestName,guestQuota\nBudi Santoso,2\nSiti Aminah,1"}</pre></div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={showPreview}>
          <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="guestCsv">File CSV</Label><Input id="guestCsv" name="file" type="file" accept=".csv,text/csv" required disabled={pending} onChange={() => { setPreview(null); setCsv(""); setError(""); setDuplicates(false); }} /></div>
          <Button type="submit" disabled={pending}>{pending ? "Memproses..." : "Lihat preview"}</Button>
        </form>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {preview && <div className="space-y-4">
          <p role="status" className="text-sm font-medium">{preview.valid} valid · {preview.invalid} invalid · {preview.duplicates} baris dengan nama duplikat</p>
          <div className="max-h-80 overflow-auto rounded-xl border border-border"><Table><TableHeader><TableRow><TableHead>Baris</TableHead><TableHead>Nama tamu</TableHead><TableHead>Kuota</TableHead><TableHead>Validasi</TableHead></TableRow></TableHeader><TableBody>{preview.rows.map((row) => <TableRow key={row.line}><TableCell>{row.line}</TableCell><TableCell className="max-w-72 whitespace-normal break-words">{safePreviewCell(row.guestName)}</TableCell><TableCell>{safePreviewCell(row.guestQuota)}</TableCell><TableCell className="max-w-80 whitespace-normal"><span className={row.errors.length ? "text-red-700" : row.duplicate ? "text-amber-800" : "text-primary"}>{row.errors.length ? row.errors.join(" ") : row.duplicate ? "Nama sama dalam CSV atau daftar acara. Akan dibuat undangan terpisah." : "Valid"}</span></TableCell></TableRow>)}</TableBody></Table></div>
          {preview.invalid > 0 && <p className="text-sm text-red-700">Perbaiki semua baris invalid, unggah file, lalu buat preview ulang. Belum ada data yang disimpan.</p>}
          {preview.duplicates > 0 && <label className="flex items-start gap-3 rounded-lg bg-warning-soft p-3 text-sm"><input type="checkbox" checked={duplicates} disabled={pending} onChange={(event) => setDuplicates(event.target.checked)} className="mt-1 accent-emerald-800" />Saya telah memeriksa nama duplikat dan ingin membuat setiap baris sebagai undangan terpisah.</label>}
          <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Batal</Button><Button disabled={pending || preview.invalid > 0 || !preview.valid || (preview.duplicates > 0 && !duplicates)} onClick={confirm}>{pending ? "Menyimpan..." : `Konfirmasi impor ${preview.valid} tamu`}</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
