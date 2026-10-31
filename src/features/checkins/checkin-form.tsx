"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { QrCode, Search, ListChecks } from "lucide-react";
import { QrScanner } from "./qr-scanner";
import { PrecheckinQueue } from "@/features/precheckins/queue";
import type { Arrival, ArrivalInput, CheckinGuest, Verification, VerifyInput } from "./validation";

const attendance = (guest: CheckinGuest) => `${guest.checkedInCount ?? 0}/${guest.guestQuota} hadir · ${(guest.checkedInCount ?? 0) === 0 ? "Belum hadir" : (guest.checkedInCount ?? 0) < guest.guestQuota ? "Sebagian hadir" : "Kuota penuh"}`;

async function requestJson(url: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store", ...(body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Permintaan gagal.");
  return result;
}

export function CheckinForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"QR" | "NAME_SEARCH" | "PUBLIC">("QR");
  const [queueVersion, setQueueVersion] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ query: string; guests: CheckinGuest[]; error?: string }>({ query: "", guests: [] });
  const [verification, setVerification] = useState<Verification | null>(null);
  const [count, setCount] = useState("1");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [attempt, setAttempt] = useState<ArrivalInput | null>(null);
  const [history, setHistory] = useState<Arrival[]>([]);
  const [historyError, setHistoryError] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const closeCamera = useCallback(() => setCameraOpen(false), []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loadHistory = useCallback(async () => {
    try {
      const result = await requestJson(`/api/checkins/history?eventId=${eventId}`);
      if (mounted.current) { setHistory(result.arrivals); setHistoryError(""); }
    } catch { if (mounted.current) setHistoryError("Riwayat belum dapat dimuat. Coba muat ulang."); }
  }, [eventId]);
  useEffect(() => {
    const controller = new AbortController();
    void requestJson(`/api/checkins/history?eventId=${eventId}`, undefined, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setHistory(result.arrivals); })
      .catch(() => { if (!controller.signal.aborted) setHistoryError("Riwayat belum dapat dimuat. Coba muat ulang."); });
    return () => controller.abort();
  }, [eventId]);
  useEffect(() => {
    if (tab !== "NAME_SEARCH" || query.trim().length < 2 || verification) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void requestJson(`/api/checkins/search?eventId=${eventId}&q=${encodeURIComponent(query.trim())}`, undefined, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setSearch({ query, guests: result.invitations }); })
        .catch((error: Error) => { if (!controller.signal.aborted) setSearch({ query, guests: [], error: error.message }); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, eventId, tab, verification]);

  const verify = useCallback(async (input: VerifyInput) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setCameraOpen(false); setMessage("");
    try {
      const result = await requestJson("/api/checkins/verify", input);
      if (!mounted.current) return;
      setVerification(result); setCount("1"); setConfirmed(false); setDialogError(""); setAttempt(null);
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "Verifikasi gagal."); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }, []);
  const onScan = useCallback((value: string) => { void verify({ eventId, method: "QR", code: value }); }, [eventId, verify]);
  const remaining = verification ? verification.invitation.guestQuota - (verification.invitation.checkedInCount ?? 0) : 0;
  const validCount = Number.isInteger(Number(count)) && Number(count) > 0 && Number(count) <= remaining;

  async function confirmArrival() {
    if (lock.current || !verification || !confirmed || !validCount) return;
    lock.current = true; setBusy(true); setDialogError("");
    const payload = attempt ?? { eventId, verificationToken: verification.verificationToken, count: Number(count), confirmed: true as const };
    setAttempt(payload);
    try {
      const response = await fetch("/api/checkins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!mounted.current) return;
      if (!response.ok) {
        const rejected = response.status < 500 && response.status !== 429;
        if (rejected) setAttempt(null);
        setDialogError(`${result.error ?? "Check-in gagal."}${rejected ? " Tutup dialog dan verifikasi kembali sebelum mencoba." : " Coba ulang transaksi yang sama."}`);
        return;
      }
      setMessage(`Check-in berhasil: ${result.arrival.count} orang. Sisa kuota ${result.invitation.guestQuota - (result.invitation.checkedInCount ?? 0)} orang.${result.replayed ? " Retry terkonfirmasi; tidak ada tambahan pencatatan." : ""}`);
      setVerification(null); setAttempt(null); setCode(""); setQuery("");
      setQueueVersion(value => value + 1);
      void loadHistory(); router.refresh();
    } catch { if (mounted.current) setDialogError("Hasil belum diketahui karena koneksi terganggu. Gunakan Coba ulang transaksi; jumlah dan identitas transaksi tetap sama."); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  return <section className="space-y-5 rounded-lg border border-border bg-card p-4 sm:p-6" aria-label="Check-in tamu">
    <div><h2 className="text-xl font-semibold text-primary">Sambut tamu</h2><p className="mt-1 text-sm text-muted-foreground">Verifikasi undangan, lalu catat jumlah yang datang sekarang.</p></div>
    <Tabs.Root value={tab} onValueChange={(value) => { if (!busy && (value === "QR" || value === "NAME_SEARCH" || value === "PUBLIC")) { setTab(value); closeCamera(); } }} className="space-y-5">
      <Tabs.List aria-label="Metode pencarian" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-3">
        <Tabs.Tab value="QR" disabled={busy} className="checkin-tab"><QrCode className="size-4" aria-hidden="true" />Scan QR</Tabs.Tab>
        <Tabs.Tab value="NAME_SEARCH" disabled={busy} className="checkin-tab"><Search className="size-4" aria-hidden="true" />Cari Nama</Tabs.Tab>
        <Tabs.Tab value="PUBLIC" disabled={busy} className="checkin-tab col-span-2 sm:col-span-1"><ListChecks className="size-4" aria-hidden="true" />Antrean pre-check-in</Tabs.Tab>
      </Tabs.List>
    <Tabs.Panel value="PUBLIC"><PrecheckinQueue key={`${eventId}-${queueVersion}`} eventId={eventId} onVerified={result => { setVerification(result); setCount("1"); setConfirmed(false); setDialogError(""); setAttempt(null); setMessage(""); }} /></Tabs.Panel><Tabs.Panel value="QR" className="space-y-4">
      <p className="text-sm text-muted-foreground">Pindai QR pada undangan tamu. Kamera akan meminta izin saat diaktifkan.</p>
      {cameraOpen ? <QrScanner onScan={onScan} onClose={closeCamera} /> : <Button className="min-h-12 w-full" disabled={busy} onClick={() => setCameraOpen(true)}>Aktifkan kamera</Button>}
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void verify({ eventId, method: "MANUAL", code }); }}>
        <Label htmlFor="manual-code">Kode undangan manual</Label><Input id="manual-code" className="min-h-12" value={code} onChange={(event) => setCode(event.target.value)} maxLength={200} required autoComplete="off" disabled={busy} />
        <Button type="submit" variant="outline" className="min-h-12 w-full" disabled={busy || !code.trim()}>Verifikasi kode</Button>
      </form>
    </Tabs.Panel><Tabs.Panel value="NAME_SEARCH" className="space-y-3">
      <Label htmlFor="guest-search">Nama tamu</Label><Input id="guest-search" className="min-h-12" placeholder="Ketik minimal 2 karakter" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} autoComplete="off" disabled={busy} />
      <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">Nama bukan bukti identitas. Cocokkan nama, kuota, dan referensi undangan dengan tamu atau koordinator; nama sama tetap undangan terpisah.</p>
      {query.trim().length >= 2 && (search.query !== query ? <p role="status">Mencari tamu...</p> : search.error ? <p role="alert">{search.error}</p> : search.guests.length ? <ul className="space-y-2">{search.guests.map((guest) => <li key={guest.id}><button type="button" disabled={busy} onClick={() => void verify({ eventId, method: "NAME_SEARCH", invitationId: guest.id })} className="w-full rounded-xl border p-4 text-left hover:bg-success-soft focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50"><span className="block font-semibold">{guest.guestName}</span><span className="mt-1 block text-sm">{attendance(guest)}</span><span className="mt-1 block break-all text-xs text-muted-foreground">Ref: {guest.id}</span></button></li>)}</ul> : <p role="status">Tidak ada undangan yang cocok. Coba sebagian nama atau hubungi koordinator.</p>)}
    </Tabs.Panel></Tabs.Root>
    {busy && !verification && <p role="status">Memverifikasi undangan...</p>}
    {message && <p role="status" className="rounded-xl bg-muted p-3 text-sm">{message}</p>}
    <Dialog open={!!verification} onOpenChange={(open) => { if (!open && !busy && !attempt) setVerification(null); }}>
      <DialogContent showCloseButton={!busy && !attempt} className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Verifikasi kedatangan</DialogTitle><DialogDescription>Pastikan undangan ini benar sebelum mencatat kehadiran.</DialogDescription></DialogHeader>
        {verification?.ticket && <p className="rounded-lg bg-warning-soft p-3 text-sm">Tiket {verification.ticket.queueCode} · Nama yang dimasukkan: {verification.ticket.submittedName}. Pastikan cocok dengan undangan yang dipilih di bawah.</p>}
        {verification && <><div className="space-y-2"><p className="text-lg font-semibold">{verification.invitation.guestName}</p><p>{verification.event.name}</p><p className="break-all text-xs text-muted-foreground">Ref: {verification.invitation.id}</p><dl className="grid grid-cols-2 gap-2 rounded-xl bg-success-soft p-3"><dt>Kuota undangan</dt><dd>{verification.invitation.guestQuota}</dd><dt>Sudah hadir</dt><dd>{verification.invitation.checkedInCount ?? 0}</dd><dt>Sisa kuota</dt><dd>{remaining}</dd></dl></div>
          <Label htmlFor="arrival-count">Jumlah yang datang sekarang</Label><Input id="arrival-count" className="min-h-12" type="number" min={1} max={remaining} value={count} onChange={(event) => setCount(event.target.value)} disabled={busy || !!attempt} />
          <label className="flex min-h-12 items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-emerald-700" checked={confirmed} disabled={busy || !!attempt} onChange={(event) => setConfirmed(event.target.checked)} /><span>Saya sudah mencocokkan undangan dan mengonfirmasi identitas tamu secara manual.</span></label>
          {!remaining && <p role="status">Kuota sudah penuh. Tidak ada kedatangan tambahan yang dapat dicatat.</p>}
          {dialogError && <p role="alert" className="text-sm text-red-700">{dialogError}</p>}
          <Button className="min-h-12 w-full" disabled={busy || !confirmed || !validCount || (!!dialogError && !attempt)} onClick={() => void confirmArrival()}>{busy ? "Mencatat..." : attempt ? "Coba ulang transaksi" : "Konfirmasi check-in"}</Button>
          {!attempt && <Button className="min-h-12" variant="outline" disabled={busy} onClick={() => setVerification(null)}>Batal / verifikasi ulang</Button>}
        </>}
      </DialogContent>
    </Dialog>
    <section className="border-t pt-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Kedatangan terbaru</h3><Button variant="outline" onClick={() => void loadHistory()}>Muat ulang</Button></div>{historyError && <p role="alert">{historyError}</p>}{history.length ? <ul className="mt-3 divide-y">{history.map((arrival) => <li key={arrival.id} className="py-3 text-sm"><p className="font-medium">{arrival.invitation.guestName} · +{arrival.count} orang</p><p className="text-muted-foreground">{arrival.method} · {arrival.user?.name ?? "Petugas lama"}{arrival.legacy ? " · Riwayat migrasi" : ""}</p><p className="text-xs text-muted-foreground">{new Date(arrival.createdAt).toLocaleString("id-ID")}</p></li>)}</ul> : !historyError && <p className="mt-3 text-sm text-muted-foreground">Belum ada kedatangan tercatat.</p>}</section>
  </section>;
}
