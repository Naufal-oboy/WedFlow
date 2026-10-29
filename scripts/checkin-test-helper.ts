import assert from "node:assert/strict";

export async function checkinPayload(session: { json(path: string, method: string, data: unknown): Promise<Response> }, eventId: string, code: string, count: number, method: "QR" | "MANUAL" = "MANUAL") {
  const response = await session.json("/api/checkins/verify", "POST", { eventId, code, method });
  assert.equal(response.status, 200, "Invitation must be verified before preparing a check-in");
  const result = await response.json();
  return { eventId, verificationToken: result.verificationToken as string, count, confirmed: true };
}
