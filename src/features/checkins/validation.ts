import { z } from "zod";

export const eventIdSchema = z.uuid();
export const searchSchema = z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u).transform((v) => v.normalize("NFC"));
export const verifySchema = z.discriminatedUnion("method", [
  z.object({ eventId: z.uuid(), method: z.literal("NAME_SEARCH"), invitationId: z.uuid() }).strict(),
  z.object({ eventId: z.uuid(), method: z.enum(["QR", "MANUAL"]), code: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/) }).strict(),
]);
export const confirmSchema = z.object({
  eventId: z.uuid(), verificationToken: z.string().min(1).max(2048),
  confirmed: z.literal(true), count: z.number().int().min(1).max(1000),
}).strict();
export type ArrivalInput = z.infer<typeof confirmSchema>;
export type VerifyInput = z.infer<typeof verifySchema>;

export type CheckinGuest = {
  id: string; guestName: string; guestQuota: number; checkedInCount: number | null;
  checkedInAt: string | null;
};
export type Verification = { event: { id: string; name: string }; invitation: CheckinGuest; verificationToken: string };
export type Arrival = { id: string; count: number; method: string; createdAt: string; legacy: boolean; invitation: { guestName: string }; user: { name: string } | null };
