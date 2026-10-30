import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const TICKET_TTL_MS = 20 * 60_000;
export const publicReceiptMessage = "Permintaan diterima. Tunjukkan kode antrean kepada petugas untuk verifikasi undangan. Tiket ini belum merupakan bukti kehadiran.";
export const hashTicket = (token: string) => createHash("sha256").update(token).digest("hex");
export function newTicket() {
  const token = `PCT-${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashTicket(token), queueCode: randomBytes(4).toString("hex").toUpperCase() };
}
export function publicOrigin() {
  const value = process.env.APP_ORIGIN ?? process.env.AUTH_URL;
  if (!value) throw new Error("APP_ORIGIN atau AUTH_URL wajib diatur.");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Origin aplikasi harus HTTPS (HTTP hanya untuk localhost), tanpa path atau kredensial.");
  }
  return url.origin;
}
