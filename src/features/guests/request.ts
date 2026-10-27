import "server-only";
import { AccessError } from "@/features/auth/access";

// Limit actual bytes, including chunked requests, before parsing JSON.
export async function readGuestJson(request: Request, limit = 8192): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new AccessError(415, "Gunakan Content-Type application/json.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Body request wajib diisi.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new AccessError(413, "Ukuran request terlalu besar."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new AccessError(400, "Gunakan encoding UTF-8 yang valid."); }
  return JSON.parse(text);
}
