"use client";

import { useRef, useState } from "react";
import { Download, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatEventDate } from "@/features/management/validation";

type Preview = {
  invitation: { guestName: string; guestQuota: number; code: string; checkedInAt: string | null; checkedInCount: number | null; event: { name: string; eventDate: string; location: string | null } };
  pngDataUrl: string;
};

export function InvitationQrActions({ eventId, invitationId, guestName }: { eventId: string; invitationId: string; guestName: string }) {
  const base = `/api/admin/events/${encodeURIComponent(eventId)}/invitations/${encodeURIComponent(invitationId)}`;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  async function showPreview() {
    const version = ++requestVersion.current;
    setOpen(true); setLoading(true); setError(""); setPreview(null);
    try {
      const response = await fetch(`${base}/qr`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "QR belum dapat dimuat.");
      if (version === requestVersion.current) setPreview(data);
    } catch (cause) {
      if (version === requestVersion.current) {
        const message = cause instanceof Error ? cause.message : "Koneksi terganggu.";
        setError(message); toast.error(message);
      }
    } finally { if (version === requestVersion.current) setLoading(false); }
  }

  async function download() {
    setDownloading(true);
    try {
      // Always authorize a fresh request, even when a preview is already open.
      const response = await fetch(`${base}/qr?download=1`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Download QR gagal.");
      }
      if (response.headers.get("content-type") !== "image/png") throw new Error("Format QR tidak valid.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `wedflow-invitation-${invitationId}.png`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("QR PNG siap diunduh.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Koneksi terganggu."); }
    finally { setDownloading(false); }
  }

  const printLink = <a href={`${base}/print`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2" aria-label={`Print undangan ${guestName} (tab baru)`}><Printer className="size-4" />Print undangan</a>;
  return <>
    <div className="flex flex-wrap gap-2" aria-label={`Aksi undangan ${guestName}`} data-testid={`invitation-actions-${invitationId}`}>
      <Button variant="outline" onClick={showPreview}><QrCode />Lihat QR</Button>
      <Button variant="outline" disabled={downloading} onClick={download}><Download />{downloading ? "Mengunduh..." : "Download QR"}</Button>
      {printLink}
    </div>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { requestVersion.current++; setPreview(null); setError(""); } }}>
      <DialogContent className="wedflow-theme max-h-[90dvh] overflow-y-auto bg-[#faf8f2] sm:max-w-lg">
        <DialogHeader><DialogTitle>QR undangan</DialogTitle><DialogDescription>Tunjukkan QR kepada petugas pada acara yang tertera.</DialogDescription></DialogHeader>
        {loading && <p role="status" className="py-12 text-center text-emerald-800">Menyiapkan QR undangan...</p>}
        {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-red-800"><p>{error}</p><Button variant="outline" onClick={showPreview}>Coba lagi</Button></div>}
        {preview && <>
          <div className="rounded-xl border border-[#d8c79e] bg-white p-5 text-center">
            <p className="text-xs uppercase tracking-widest text-[#73603b]">{preview.invitation.event.name}</p>
            <h2 className="mt-2 text-xl font-semibold text-emerald-950">{preview.invitation.guestName}</h2>
            <p className="mt-2 text-sm">Kuota {preview.invitation.guestQuota} orang · {preview.invitation.checkedInAt ? `Sudah hadir (${preview.invitation.checkedInCount} orang)` : "Belum hadir"}</p>
            {/* A private in-memory data URL must not use the public Next image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.pngDataUrl} width={1024} height={1024} alt={`QR undangan ${preview.invitation.guestName}`} className="mx-auto my-3 aspect-square w-64 max-w-full" onError={() => { setError("Gambar QR gagal dimuat. Coba lagi."); setPreview(null); }} />
            <p className="text-xs text-stone-500">Kode undangan</p><code className="mt-1 block break-all text-xs">{preview.invitation.code}</code>
            <p className="mt-4 text-xs text-stone-500">{formatEventDate(new Date(preview.invitation.event.eventDate))}<br />{preview.invitation.event.location ?? "Lokasi akan diinformasikan"}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2"><Button onClick={download} disabled={downloading}><Download />{downloading ? "Mengunduh..." : "Download PNG"}</Button>{printLink}</div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
