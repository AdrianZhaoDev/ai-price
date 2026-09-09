type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const globalRateLimits = globalThis as typeof globalThis & {
  __aiPriceRateLimits?: Map<string, RateLimitRecord>;
};

const records =
  globalRateLimits.__aiPriceRateLimits ??
  (globalRateLimits.__aiPriceRateLimits = new Map());
const MAX_RATE_LIMIT_KEYS = 10_000;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  let record = records.get(key);
  if (record && record.resetAt <= now) {
    records.delete(key);
    record = undefined;
  }

  if (!record) {
    if (records.size >= MAX_RATE_LIMIT_KEYS) {
      for (const [recordKey, candidate] of records) {
        if (candidate.resetAt <= now) records.delete(recordKey);
      }
    }
    if (records.size >= MAX_RATE_LIMIT_KEYS) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
      };
    }
    records.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearRateLimitsForTests(): void {
  records.clear();
}
