import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";

// The database's existing Invitation.code @unique is the sole QR identity.
export function generateInvitationCode() {
  return `WF-${randomBytes(32).toString("hex")}`;
}

// Guest Management already issues 24-byte random and 32-byte HMAC base64url
// codes. Preserve those identities, including import replay protection.
export const qrCodeSchema = z.string().regex(/^(?:WF-[a-f0-9]{64}|[A-Za-z0-9_-]{32}|[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/);

export function invitationPayload(code: string) {
  return qrCodeSchema.parse(code);
}

export async function invitationPng(code: string) {
  return QRCode.toBuffer(invitationPayload(code), {
    type: "png", width: 1024, margin: 4, errorCorrectionLevel: "M",
    color: { dark: "#000000ff", light: "#ffffffff" },
  });
}

export function invitationFilename(invitationId: string) {
  return `wedflow-invitation-${z.uuid().parse(invitationId)}.png`;
}
