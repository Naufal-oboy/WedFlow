import { z } from "zod";
import { searchSchema } from "@/features/checkins/validation";

export const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const submitSchema = z.object({ name: searchSchema }).strict();
export const lookupSchema = z.object({
  eventId: z.uuid(), lookup: z.string().trim().max(100).regex(/^(?:[A-Fa-f0-9]{8}|PCT-[A-Za-z0-9_-]{43})$/),
}).strict();
export const ticketActionSchema = z.object({ eventId: z.uuid(), requestId: z.uuid() }).strict();
export const ticketVerifySchema = ticketActionSchema.extend({ invitationId: z.uuid() }).strict();
export type TicketRow = {
  id: string; queueCode: string; submittedName: string; status: "PENDING" | "VERIFIED" | "EXPIRED" | "CANCELLED";
  createdAt: string; expiresAt: string;
};
