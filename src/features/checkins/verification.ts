import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccessError } from "@/lib/access-error";

const claimsSchema = z.object({
  id: z.uuid(), eventId: z.uuid(), invitationId: z.uuid(), userId: z.uuid(),
  method: z.enum(["QR", "NAME_SEARCH", "MANUAL", "PUBLIC_PRECHECKIN"]), count: z.number().int(), quota: z.number().int(),
  precheckinId: z.uuid().optional(),
  name: z.string(), expires: z.number(),
}).refine(value => (value.method === "PUBLIC_PRECHECKIN") === !!value.precheckinId);
export type VerificationClaims = z.infer<typeof claimsSchema>;
function sign(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET wajib diatur.");
  return createHmac("sha256", secret).update(`checkin-verification:${payload}`).digest("base64url");
}
export function createVerification(claims: Omit<VerificationClaims, "id" | "expires">) {
  const payload = Buffer.from(JSON.stringify({ ...claims, id: randomUUID(), expires: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
// Expiry is checked after persisted replay lookup: a committed request can be
// retried after expiry, but an unused expired verification cannot create an arrival.
export function readVerification(token: string, eventId: string, userId: string) {
  const invalid = () => new AccessError(409, "Verifikasi tidak valid. Pilih dan verifikasi undangan kembali.");
  const parts = token.split(".");
  if (parts.length !== 2) throw invalid();
  const actual = Buffer.from(parts[1]), expected = Buffer.from(sign(parts[0]));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
  let claims: VerificationClaims;
  try { claims = claimsSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))); }
  catch { throw invalid(); }
  if (claims.eventId !== eventId || claims.userId !== userId) throw invalid();
  return claims;
}
