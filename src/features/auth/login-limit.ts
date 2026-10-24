import "server-only";

// Per-process protection. Add a shared gateway/Redis limiter for multi-instance hosting.
const attempts = new Map<string, { count: number; expires: number }>();
export function allowLoginAttempt(email: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const entry = attempts.get(email);
  if (entry) return ++entry.count <= 10;
  if (attempts.size >= 10_000) return false;
  attempts.set(email, { count: 1, expires: now + 15 * 60_000 });
  return true;
}
export function clearLoginAttempts(email: string) { attempts.delete(email); }
