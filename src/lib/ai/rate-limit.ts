interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_ENTRIES = 10_000;

// Clean up expired keys every 5 minutes (or immediately if cap exceeded)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && rateLimitMap.size < MAX_ENTRIES) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
  // Evict oldest keys if still above cap to prevent unbounded memory growth
  while (rateLimitMap.size >= MAX_ENTRIES) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (!oldestKey) break;
    rateLimitMap.delete(oldestKey);
  }
}

export function checkRateLimit(
  key: string,
  limit: number = 15,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetInSec: number } {
  cleanup();
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetInSec: Math.ceil(windowMs / 1000) };
  }

  if (entry.count >= limit) {
    const resetInSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetInSec };
  }

  entry.count += 1;
  const resetInSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return { allowed: true, remaining: limit - entry.count, resetInSec };
}

