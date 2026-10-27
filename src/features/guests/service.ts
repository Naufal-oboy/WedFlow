import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AccessError, requireApiUser } from "@/features/auth/access";
import { eventScope } from "@/features/events/scope";
import { GUEST_PAGE_SIZE, guestSchema, type GuestFilters, type GuestInput } from "./validation";
import { CsvError, parseGuestCsv, type CsvPreview } from "./csv";
import { createImportToken, importCode, verifyImportToken } from "./import-token";

export const guestSelect = {
  id: true, eventId: true, guestName: true, code: true, guestQuota: true,
  createdAt: true, checkedInAt: true, checkedInCount: true,
} satisfies Prisma.InvitationSelect;

export async function requireGuestEvent(eventId: string) {
  const user = await requireApiUser(["SUPER_ADMIN"]);
  z.uuid().parse(eventId);
  const event = await prisma.event.findFirst({ where: { AND: [{ id: eventId }, eventScope(user)] }, select: { id: true, name: true } });
  if (!event) throw new AccessError(404, "Acara tidak ditemukan.");
  return { event, user };
}

export async function listGuests(eventId: string, filters: GuestFilters) {
  const { event } = await requireGuestEvent(eventId);
  const where: Prisma.InvitationWhereInput = {
    eventId,
    ...(filters.q && { OR: [{ guestName: { contains: filters.q, mode: "insensitive" } }, { code: { contains: filters.q, mode: "insensitive" } }] }),
    ...(filters.attendance === "present" ? { checkedInAt: { not: null } } : filters.attendance === "absent" ? { checkedInAt: null } : {}),
  };
  const orderBy: Prisma.InvitationOrderByWithRelationInput = filters.sort.startsWith("name")
    ? { guestName: filters.sort === "name_asc" ? "asc" : "desc" }
    : { createdAt: filters.sort === "created_asc" ? "asc" : "desc" };
  return prisma.$transaction(async (tx) => {
    const total = await tx.invitation.count({ where });
    const page = Math.min(filters.page, Math.max(1, Math.ceil(total / GUEST_PAGE_SIZE)));
    const guests = await tx.invitation.findMany({ where, select: guestSelect, orderBy: [orderBy, { id: "asc" }], skip: (page - 1) * GUEST_PAGE_SIZE, take: GUEST_PAGE_SIZE });
    return { event, guests, total, page, pageSize: GUEST_PAGE_SIZE };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getGuest(eventId: string, guestId: string) {
  const { event } = await requireGuestEvent(eventId);
  z.uuid().parse(guestId);
  const guest = await prisma.invitation.findFirst({ where: { id: guestId, eventId }, select: { ...guestSelect, checkedInBy: { select: { id: true, name: true } } } });
  if (!guest) throw new AccessError(404, "Undangan tidak ditemukan pada acara ini.");
  return { event, guest };
}

export async function createGuest(eventId: string, input: GuestInput) {
  await requireGuestEvent(eventId);
  const data = guestSchema.parse(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.invitation.create({ data: { ...data, eventId, code: randomBytes(24).toString("base64url") }, select: guestSelect });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  throw new AccessError(409, "Kode undangan belum dapat dibuat. Silakan coba kembali.");
}

export async function editGuest(eventId: string, guestId: string, input: GuestInput) {
  await getGuest(eventId, guestId);
  const data = guestSchema.parse(input);
  // PostgreSQL rechecks the predicate after a concurrent check-in acquires the row lock.
  const guests = await prisma.invitation.updateManyAndReturn({
    where: { id: guestId, eventId, OR: [{ checkedInCount: null }, { checkedInCount: { lte: data.guestQuota } }] },
    data, select: guestSelect,
  });
  if (!guests.length) throw new AccessError(409, "Kuota tidak boleh lebih kecil dari jumlah hadir, atau undangan telah berubah. Muat ulang data.");
  return guests[0];
}

export async function deleteGuest(eventId: string, guestId: string) {
  await getGuest(eventId, guestId);
  const result = await prisma.invitation.deleteMany({ where: {
    id: guestId, eventId, checkedInAt: null, checkedInById: null,
    OR: [{ checkedInCount: null }, { checkedInCount: 0 }],
  } });
  if (!result.count) throw new AccessError(409, "Undangan yang sudah check-in tidak dapat dihapus, atau data telah berubah.");
}

function isUniqueConflict(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }
async function markExistingNames(tx: Prisma.TransactionClient, eventId: string, preview: CsvPreview) {
  const names = preview.rows.flatMap((row) => row.data ? [row.data.guestName] : []);
  if (!names.length) return;
  const existing = await tx.invitation.findMany({ where: { eventId, guestName: { in: names, mode: "insensitive" } }, select: { guestName: true }, distinct: ["guestName"] });
  const keys = new Set(existing.map(({ guestName }) => guestName.normalize("NFC").toLowerCase()));
  for (const row of preview.rows) row.duplicate ||= !!row.data && keys.has(row.data.guestName.toLowerCase());
  preview.duplicates = preview.rows.filter((row) => row.duplicate).length;
}

export async function importGuests(eventId: string, input: { csv: string; mode: "preview" | "confirm"; token?: string; allowDuplicateNames: boolean }) {
  const { user } = await requireGuestEvent(eventId);
  let preview: CsvPreview;
  try { preview = parseGuestCsv(input.csv); }
  catch (error) { if (error instanceof CsvError) throw new AccessError(400, error.message); throw error; }
  if (input.mode === "preview") {
    await markExistingNames(prisma, eventId, preview);
    return { ...preview, token: createImportToken(eventId, user.id, input.csv) };
  }
  verifyImportToken(input.token, eventId, user.id, input.csv);
  if (preview.invalid) throw new AccessError(400, "Perbaiki seluruh baris invalid dan buat preview ulang sebelum impor.");
  try {
    return await prisma.$transaction(async (tx) => {
      await markExistingNames(tx, eventId, preview);
      if (preview.duplicates && !input.allowDuplicateNames) throw new AccessError(409, "Nama duplikat ditemukan. Buat preview ulang dan konfirmasi sebagai undangan terpisah.");
      const result = await tx.invitation.createMany({ data: preview.rows.map((row) => ({ ...row.data!, eventId, code: importCode(input.token!, row.line) })) });
      return { imported: result.count };
    }, { isolationLevel: "Serializable", timeout: 15000 });
  } catch (error) {
    if (isUniqueConflict(error)) throw new AccessError(409, "Preview ini sudah diimpor atau kode berbenturan. Muat ulang daftar tamu sebelum mencoba kembali.");
    throw error;
  }
}
