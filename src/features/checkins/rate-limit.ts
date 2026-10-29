import "server-only";
import { AccessError } from "@/lib/access-error";

// Authenticated account-wide budget, bounded memory. Shared gateway required
// for multiple server processes; never key by a client-controlled IP header.
const buckets = new Map<string, { count: number; expires: number }>();
export function checkinRateLimit(userId: string, now = Date.now()) {
  for (const [key, value] of buckets) if (value.expires <= now) buckets.delete(key);
  const bucket = buckets.get(userId);
  if (bucket) {
    if (++bucket.count > 120) throw new AccessError(429, "Terlalu banyak permintaan. Tunggu satu menit lalu coba lagi.");
  } else {
    if (buckets.size >= 10_000) throw new AccessError(429, "Layanan sibuk. Coba lagi sebentar.");
    buckets.set(userId, { count: 1, expires: now + 60_000 });
  }
}
