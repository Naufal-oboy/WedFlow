"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/dashboard/management-ui";
import { Label } from "@/components/ui/label";
import type { CheckinGuest, Verification } from "@/features/checkins/validation";
import type { TicketRow } from "./validation";

async function json(url: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal, ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Permintaan gagal.");
  return result;
}
const labels = { PENDING: "Menunggu", VERIFIED: "Terverifikasi", CANCELLED: "Dibatalkan", EXPIRED: "Kedaluwarsa" };
export function PrecheckinQueue({ eventId, onVerified }: { eventId: string; onVerified: (value: Verification) => void }) {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [status, setStatus] = useState<TicketRow["status"]>("PENDING");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lookup, setLookup] = useState("");
  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CheckinGuest[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const listUrl = `/api/precheckins?eventId=${eventId}&status=${status}`;
  useEffect(() => {
    const controller = new AbortController();
    void json(listUrl, undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) { setRows(result.requests); setNextCursor(result.nextCursor); setError(""); setLoading(false); }
    }).catch(cause => { if (!controller.signal.aborted) { setError(cause.message); setLoading(false); } });
    return () => controller.abort();
  }, [listUrl, reload]);
  const refresh = useCallback(() => { setLoading(true); setReload(value => value + 1); }, []);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Koneksi terganggu. Coba lagi."); }
    finally { setBusy(false); }
  }
  async function open(value: string) {
    setTicket(null); setCandidates([]); setCancelConfirm(false);
    await run(async () => {
      const result = await json("/api/precheckins/open", { eventId, lookup: value });
      setTicket(result.ticket); setCandidates(result.candidates); setQuery(result.ticket.submittedName);
    });
  }
  return <section className="space-y-4" aria-label="Antrean pre-check-in">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Antrean pre-check-in</h3><Button variant="outline" disabled={busy || loading} onClick={refresh}>Muat ulang antrean</Button></div>
    <p className="text-sm text-muted-foreground">Permintaan belum membuktikan tamu terdaftar. Cocokkan secara manual; nama serupa dapat merujuk undangan berbeda.</p>
    <form className="space-y-2" onSubmit={event => { event.preventDefault(); void open(lookup.trim()); }}><Label htmlFor="ticket-lookup">Kode antrean atau token sementara</Label><Input id="ticket-lookup" className="min-h-12" autoComplete="off" maxLength={100} value={lookup} onChange={event => setLookup(event.target.value)} disabled={busy} required /><Button type="submit" className="min-h-12 w-full" variant="outline" disabled={busy || !lookup.trim()}>Buka tiket</Button></form>
    <Label htmlFor="queue-status">Status antrean</Label><select id="queue-status" className={selectClass} value={status} disabled={busy} onChange={event => { setStatus(event.target.value as TicketRow["status"]); setLoading(true); setRows([]); setTicket(null); }}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
    {loading ? <p role="status">Memuat antrean...</p> : rows.length ? <ul className="max-h-80 space-y-2 overflow-y-auto">{rows.map(row => <li key={row.id}><button type="button" className="min-h-12 w-full rounded-lg border p-3 text-left hover:bg-success-soft disabled:opacity-50" disabled={busy} onClick={() => void open(row.queueCode)}><span className="block break-words font-semibold">{row.queueCode} · {row.submittedName}</span><span className="text-xs text-muted-foreground">{labels[row.status]} · {new Date(row.createdAt).toLocaleTimeString("id-ID")}</span></button></li>)}</ul> : <p role="status">Tidak ada tiket dengan status ini.</p>}
    {!loading && nextCursor && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const result = await json(`${listUrl}&cursor=${nextCursor}`); setRows(previous => [...previous, ...result.requests]); setNextCursor(result.nextCursor); })}>Muat tiket berikutnya</Button>}
    {ticket && <div className="space-y-3 rounded-xl border border-champagne p-4"><h4 className="font-semibold">Tiket {ticket.queueCode} · {labels[ticket.status]}</h4><p className="break-words">Nama yang dimasukkan: {ticket.submittedName}</p><p className="text-sm">Berlaku sampai {new Date(ticket.expiresAt).toLocaleString("id-ID")}</p>
      {ticket.status === "PENDING" && <><form className="space-y-2" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await json(`/api/checkins/search?eventId=${eventId}&q=${encodeURIComponent(query.trim())}`); setCandidates(result.invitations); }); }}><Label htmlFor="ticket-name-search">Cari kandidat undangan</Label><Input id="ticket-name-search" className="min-h-12" value={query} minLength={2} maxLength={100} onChange={event => setQuery(event.target.value)} disabled={busy} /><Button type="submit" variant="outline" className="min-h-12 w-full" disabled={busy || query.trim().length < 2}>Cari kandidat</Button></form>
      <p className="text-sm text-warning">Pilih undangan setelah mencocokkan dengan tamu atau koordinator. Tidak ada kandidat yang dipilih otomatis.</p>
      {candidates.length ? <ul className="space-y-2">{candidates.map(candidate => <li key={candidate.id}><button type="button" disabled={busy} className="min-h-12 w-full rounded-lg border p-3 text-left hover:bg-success-soft disabled:opacity-50" onClick={() => void run(async () => { onVerified(await json("/api/precheckins/verify", { eventId, requestId: ticket.id, invitationId: candidate.id })); })}><span className="block font-semibold">{candidate.guestName}</span><span className="block text-sm">Kuota {candidate.guestQuota} · Hadir {candidate.checkedInCount ?? 0} · Sisa {candidate.guestQuota - (candidate.checkedInCount ?? 0)}</span><span className="block break-all text-xs text-muted-foreground">Ref: {candidate.id}</span></button></li>)}</ul> : <p>Tidak ada kandidat. Coba nama lain atau hubungi koordinator.</p>}
      {cancelConfirm ? <div className="space-y-2"><p>Batalkan permintaan ini tanpa mencatat kehadiran?</p><Button variant="destructive" className="min-h-12" disabled={busy} onClick={() => void run(async () => { await json("/api/precheckins/cancel", { eventId, requestId: ticket.id }); setTicket(null); setCancelConfirm(false); refresh(); })}>Ya, batalkan tiket</Button><Button variant="outline" disabled={busy} onClick={() => setCancelConfirm(false)}>Kembali</Button></div> : <Button variant="outline" className="min-h-12" disabled={busy} onClick={() => setCancelConfirm(true)}>Tolak / batalkan tiket</Button>}</>}
    </div>}
    {busy && <p role="status">Memproses permintaan...</p>}{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}
