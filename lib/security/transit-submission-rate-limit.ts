import { hashValue } from "./tokens";

const attempts = new Map<string, { count: number; expiresAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;

export function allowTransitSubmissionAttempt(
  ip: string,
  now = Date.now(),
): boolean {
  for (const [key, record] of attempts) {
    if (record.expiresAt <= now) attempts.delete(key);
  }
  const key = hashValue(ip);
  const record = attempts.get(key);
  if (record) {
    if (record.count >= 10) return false;
    record.count++;
    return true;
  }
  // Bound memory even if a client rotates addresses.
  if (attempts.size >= 1000) return false;
  attempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
  return true;
}

export function clearTransitSubmissionAttemptsForTests() {
  attempts.clear();
}
