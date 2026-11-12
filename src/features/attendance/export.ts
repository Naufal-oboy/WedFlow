import "server-only";
import { createHash } from "node:crypto";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { attendanceEvent } from "./service";
import { attendanceFilename, attendanceStatus, csvRow } from "./csv";

type ReportRow = { id: string; guestName: string; guestQuota: number; count: number; first: Date | null; latest: Date | null };

export async function attendanceExport(user: Session["user"], eventId: string, signal: AbortSignal) {
  // Reject unauthorized requests before sending CSV headers; recheck inside snapshot.
  const event = await attendanceEvent(prisma, user, eventId, true);
  const generatedAt = new Date();
  const encoder = new TextEncoder();
  let cancelled = false;
  let wake: (() => void) | undefined;
  const cancel = () => { cancelled = true; wake?.(); };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
      signal.addEventListener("abort", cancel, { once: true });
      // Bound connection lifetime even if the consumer stops reading without cancelling.
      const deadline = setTimeout(cancel, 55_000);
      async function write(text: string) {
        if (signal.aborted || cancelled) throw new Error("Export interrupted");
        controller.enqueue(encoder.encode(text));
        if ((controller.desiredSize ?? 0) <= 0) await new Promise<void>(resolve => { wake = resolve; });
        if (signal.aborted || cancelled) throw new Error("Export interrupted");
      }
      try {
        await prisma.$transaction(async tx => {
          const snapshotEvent = await attendanceEvent(tx, user, eventId, true);
          await write("\uFEFF" + csvRow(["Acara", "Slug acara", "Jadwal UTC", "Status acara", "Zona waktu laporan", "Laporan dibuat UTC", "Referensi undangan", "Nama tamu", "Kuota undangan", "Jumlah hadir terkonfirmasi", "Status kehadiran", "Check-in pertama UTC", "Check-in terakhir UTC"]));
          let after = "";
          let hasRows = false;
          const metadata = [snapshotEvent.name, snapshotEvent.slug, snapshotEvent.eventDate.toISOString(), snapshotEvent.status, snapshotEvent.timeZone, generatedAt.toISOString()];
          for (;;) {
            const rows = await tx.$queryRaw<ReportRow[]>`
              WITH batch AS (
                SELECT id, "guestName", "guestQuota" FROM "Invitation"
                WHERE "eventId" = ${eventId} AND id > ${after} ORDER BY id LIMIT 500
              )
              SELECT b.id, b."guestName", b."guestQuota", COALESCE(SUM(l.count), 0)::float8 AS count,
                MIN(l."createdAt") AS first, MAX(l."createdAt") AS latest
              FROM batch b LEFT JOIN "CheckinLog" l ON l."invitationId" = b.id AND l."eventId" = ${eventId}
              GROUP BY b.id, b."guestName", b."guestQuota" ORDER BY b.id`;
            if (!rows.length) break;
            hasRows = true;
            await write(rows.map(row => csvRow([...metadata, `INV-${createHash("sha256").update(row.id).digest("hex").slice(0, 20)}`, row.guestName, row.guestQuota, row.count, attendanceStatus(row.count, row.guestQuota), row.first?.toISOString(), row.latest?.toISOString()])).join(""));
            after = rows[rows.length - 1].id;
          }
          if (!hasRows) await write(csvRow([...metadata, "", "", 0, 0, "Tidak ada undangan", "", ""]));
        }, { isolationLevel: "RepeatableRead", timeout: 60_000 });
        controller.close();
      } catch {
        // An incomplete download fails; it must never look like a complete CSV.
        controller.error(new Error("Ekspor terputus. Silakan unduh ulang."));
      } finally {
        clearTimeout(deadline);
        signal.removeEventListener("abort", cancel);
      }
      })();
    },
    pull() { wake?.(); wake = undefined; },
    cancel,
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${attendanceFilename(event.slug, generatedAt)}"`,
    "X-Content-Type-Options": "nosniff",
  } });
}
