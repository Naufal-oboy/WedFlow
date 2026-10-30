import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { AccessError } from "@/lib/access-error";

export async function consumeLimit(key: string, limit: number, seconds = 600) {
  // Conditional UPSERT serializes concurrent callers on the same key. Database
  // time avoids inconsistent windows between application instances.
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "PrecheckinRateLimit" ("key", "count", "expiresAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP + ${seconds} * INTERVAL '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "PrecheckinRateLimit"."expiresAt" <= CURRENT_TIMESTAMP THEN 1 ELSE "PrecheckinRateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "PrecheckinRateLimit"."expiresAt" <= CURRENT_TIMESTAMP THEN EXCLUDED."expiresAt" ELSE "PrecheckinRateLimit"."expiresAt" END
    WHERE "PrecheckinRateLimit"."expiresAt" <= CURRENT_TIMESTAMP OR "PrecheckinRateLimit"."count" < ${limit}
    RETURNING "count"`;
  if (!rows.length) throw new AccessError(429, "Terlalu banyak permintaan. Tunggu beberapa menit atau hubungi petugas.");
}
export async function limitPublicRequest(request: Request) {
  // Only trust a single-IP header explicitly configured and overwritten by the
  // deployment's trusted ingress. Never blindly trust x-forwarded-for.
  const header = process.env.PRECHECKIN_IP_HEADER;
  const ip = header ? request.headers.get(header)?.trim() : null;
  if (header && (!ip || !isIP(ip))) throw new AccessError(503, "Layanan sementara tidak tersedia. Hubungi petugas.");
  const key = ip ? `ip:${createHash("sha256").update(ip).digest("hex")}` : "shared-public";
  await consumeLimit(key, ip ? 10 : 120);
  await prisma.$executeRaw`DELETE FROM "PrecheckinRateLimit" WHERE "key" IN
    (SELECT "key" FROM "PrecheckinRateLimit" WHERE "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '1 day' LIMIT 500)`;
}
