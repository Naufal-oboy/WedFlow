import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccessError } from "@/features/auth/access";

const payloadSchema = z.object({ eventId: z.uuid(), userId: z.uuid(), digest: z.string(), expires: z.number(), nonce: z.string() });
function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET wajib diatur.");
  return value;
}
function sign(value: string) { return createHmac("sha256", secret()).update(`guest-import:${value}`).digest("base64url"); }
function digest(csv: string) { return createHash("sha256").update(csv).digest("hex"); }
export function createImportToken(eventId: string, userId: string, csv: string) {
  const payload = Buffer.from(JSON.stringify({ eventId, userId, digest: digest(csv), expires: Date.now() + 15 * 60 * 1000, nonce: randomBytes(24).toString("base64url") })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifyImportToken(token: string | undefined, eventId: string, userId: string, csv: string) {
  const invalid = () => new AccessError(409, "Preview tidak valid atau kedaluwarsa. Buat preview ulang.");
  if (!token) throw invalid();
  const parts = token.split(".");
  if (parts.length !== 2) throw invalid();
  const signature = Buffer.from(parts[1]);
  const expected = Buffer.from(sign(parts[0]));
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw invalid();
  let parsed;
  try { parsed = payloadSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))); }
  catch { throw invalid(); }
  if (parsed.eventId !== eventId || parsed.userId !== userId || parsed.digest !== digest(csv) || parsed.expires < Date.now()) throw invalid();
}
export function importCode(token: string, line: number) {
  // Stable within one confirmed preview: the UNIQUE constraint also rejects replay.
  return createHmac("sha256", secret()).update(`guest-code:${token}:${line}`).digest("base64url");
}
