"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/management-ui";
import { attendancePolling } from "./polling";
import { attendanceTime, type AttendanceSnapshot } from "./model";

const methods: Record<string, string> = { QR: "QR undangan", MANUAL: "Kode manual", NAME_SEARCH: "Pencarian nama", PUBLIC_PRECHECKIN: "Pre-check-in terverifikasi" };
class AttendanceAccessError extends Error {}

export function AttendanceDashboard({ eventId, canExport }: { eventId: string; canExport: boolean }) {
  const [data, setData] = useState<AttendanceSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState("");
  const refresh = useRef<() => void>(() => {});
  const downloadController = useRef<AbortController | null>(null);

  useEffect(() => {
    const polling = attendancePolling<AttendanceSnapshot>({
      visible: !document.hidden,
      async load(signal) {
        const response = await fetch(`/api/events/${eventId}/attendance`, { signal, cache: "no-store" });
        if ([401, 403, 404].includes(response.status)) throw new AttendanceAccessError("Akses acara tidak tersedia. Silakan login kembali atau hubungi admin.");
        if (!response.ok) throw new Error("Data belum dapat diperbarui. Periksa koneksi lalu coba lagi.");
        return response.json();
      },
      success(value) { setData(value); setError(""); },
      failure(reason) {
        if (reason instanceof AttendanceAccessError) { setData(null); setDenied(true); setBusy(false); polling.stop(); }
        setError(reason instanceof AttendanceAccessError ? reason.message : "Pembaruan gagal. Data terakhir tetap ditampilkan; mencoba kembali otomatis.");
      },
      busy: setBusy,
    });
    refresh.current = () => { void polling.refresh(); };
    const visibility = () => { setPaused(document.hidden); polling.visibility(!document.hidden); };
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => { polling.stop(); document.removeEventListener("visibilitychange", visibility); downloadController.current?.abort(); };
  }, [eventId]);

  async function download() {
    if (downloading) return;
    setDownloading(true); setExportError("");
    const controller = new AbortController();
    downloadController.current = controller;
    try {
      const response = await fetch(`/api/events/${eventId}/attendance/export`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Laporan tidak dapat diunduh. Periksa akses dan coba kembali.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "wedflow-attendance.csv";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (!controller.signal.aborted) setExportError("Unduhan gagal atau terputus. Silakan unduh ulang laporan."); }
    finally { if (!controller.signal.aborted) setDownloading(false); }
  }

  const zone = data?.event.timeZone ?? "Asia/Jakarta";
  const number = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
  const max = Math.max(1, ...data?.timeline.buckets.map(bucket => bucket.count) ?? []);
  return <section id="overview" aria-label="Laporan kehadiran" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow">Kehadiran langsung</p><h2 className="mt-2 text-xl font-semibold text-primary">{data?.event.name ?? "Laporan kehadiran"}</h2>{data && <div className="mt-2"><StatusBadge status={data.event.status} /></div>}</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || denied} onClick={() => refresh.current()}><RefreshCw className={busy ? "animate-spin" : ""} aria-hidden="true" />{busy ? "Memperbarui…" : "Perbarui"}</Button>{canExport && <Button variant="outline" onClick={() => void download()} disabled={downloading || denied}><Download aria-hidden="true" />{downloading ? "Menyiapkan CSV…" : "Unduh CSV"}</Button>}</div>
    </div>
    <div role="status" aria-live="polite" className="text-sm leading-6 text-muted-foreground">
      {error ? <p className="rounded-lg bg-warning-soft p-3 text-warning">{data && <strong>Data mungkin kedaluwarsa. </strong>}{error}</p> : <p>{paused ? "Pembaruan dijeda saat tab tersembunyi." : busy ? "Mengambil data kehadiran…" : "Terhubung · diperbarui setiap 15 detik saat tab aktif."}</p>}
      <p>Refresh berhasil terakhir: {data ? attendanceTime(data.refreshedAt, zone) : "Belum tersedia"}</p>
    </div>
    {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
    {!data && busy && <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Memuat statistik">{[1, 2, 3, 4].map(value => <div key={value} className="h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div>}
    {data && <>
      <div className="metric-grid grid-cols-2 lg:grid-cols-4">{[
        ["Tamu hadir", `${number(data.summary.attendees)} orang`],
        ["Tingkat kehadiran", `${number(data.summary.percentage)}%`],
        ["Sisa kapasitas", `${number(data.summary.remaining)} orang`],
        ["Kapasitas undangan", `${number(data.summary.capacity)} orang`],
      ].map(([label, value]) => <div className="metric px-3 sm:px-6" key={label}><p className="text-xs text-muted-foreground sm:text-sm">{label}</p><p className="mt-3 text-xl font-semibold text-primary tabular-nums sm:text-2xl">{value}</p></div>)}</div>
      <div className="space-y-1 text-sm leading-6 text-muted-foreground"><p>{number(data.summary.invitations)} undangan terdaftar · {number(data.summary.arrivedInvitations)} undangan sudah mencatat kehadiran.</p><p>Persentase = jumlah orang hadir terkonfirmasi ÷ total kuota undangan. Tiket publik belum terverifikasi tidak dihitung.</p><p>Check-in terakhir: {data.summary.latestCheckinAt ? attendanceTime(data.summary.latestCheckinAt, zone) : "Belum ada check-in terkonfirmasi."}</p></div>
      <section aria-labelledby="attendance-timeline-title" className="surface p-4 sm:p-6">
        <h3 id="attendance-timeline-title" className="font-semibold text-primary">Kedatangan sepanjang acara</h3>
        <p className="mt-2 text-sm text-muted-foreground">Orang hadir per interval {data.timeline.intervalMinutes} menit · {zone}. Waktu menunjukkan awal interval; seluruh riwayat acara ditampilkan.</p>
        {data.timeline.buckets.length ? <>
          <div className="mt-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Grafik kedatangan; gulir horizontal. Rincian angka tersedia di bawah.">
            <div className="flex h-52 items-end gap-2 border-b pb-2" style={{ minWidth: Math.max(260, data.timeline.buckets.length * 44) }}>
              {data.timeline.buckets.map(bucket => <div key={bucket.start} className="flex h-full min-w-9 flex-1 flex-col justify-end text-center" title={`${attendanceTime(bucket.start, zone)}: ${bucket.count} orang`}><span className="mb-1 text-xs tabular-nums">{bucket.count}</span><div className="mx-auto w-full max-w-10 rounded-t-sm bg-primary" style={{ height: `${bucket.count / max * 75}%`, minHeight: bucket.count ? 3 : 0 }} /><span className="mt-2 text-[10px] text-muted-foreground">{new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(bucket.start))}</span></div>)}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{attendanceTime(data.timeline.buckets[0].start, zone)} — {attendanceTime(data.timeline.buckets.at(-1)!.start, zone)}</p>
          <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium text-primary">Lihat rincian waktu dan jumlah</summary><ul className="max-h-64 overflow-y-auto divide-y">{data.timeline.buckets.map(bucket => <li key={bucket.start} className="flex justify-between gap-4 py-2"><span>{attendanceTime(bucket.start, zone)}</span><span className="shrink-0 tabular-nums">{bucket.count} orang</span></li>)}</ul></details>
        </> : <p className="py-10 text-sm text-muted-foreground">Grafik akan terisi setelah petugas mengonfirmasi kedatangan pertama.</p>}
      </section>
      <section aria-labelledby="attendance-activity-title"><h3 id="attendance-activity-title" className="font-semibold text-primary">Aktivitas check-in terbaru</h3><p className="mt-2 text-sm text-muted-foreground">Maksimal 20 kedatangan terkonfirmasi, terbaru lebih dahulu · {zone}</p>
        {data.activity.length ? <ul tabIndex={0} aria-label="Kedatangan terbaru, gulir untuk melihat lainnya" className="mt-4 max-h-128 overflow-y-auto divide-y border-y pr-2">{data.activity.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-3 py-4 text-sm"><div className="min-w-0 flex-1 basis-48"><p className="break-words font-medium">{row.guestName}</p><p className="mt-1 text-muted-foreground">{row.legacy ? "Riwayat lama" : methods[row.method] ?? "Metode tidak tersedia"}{row.staffName ? ` · ${row.staffName}` : ""}</p></div><div className="text-left sm:text-right"><p className="font-medium tabular-nums">+{row.count} orang</p><time dateTime={row.createdAt} className="mt-1 block text-muted-foreground">{attendanceTime(row.createdAt, zone)}</time></div></li>)}</ul> : <p className="mt-4 border-y py-8 text-sm text-muted-foreground">Belum ada check-in terkonfirmasi pada acara ini.</p>}
      </section>
    </>}
  </section>;
}
