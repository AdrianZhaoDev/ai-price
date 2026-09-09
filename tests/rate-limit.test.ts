import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clearRateLimitsForTests,
} from "@/lib/security/rate-limit";

beforeEach(clearRateLimitsForTests);

describe("bounded in-memory rate limits", () => {
  it("counts attempts and resets an expired key", () => {
    expect(checkRateLimit("key", 2, 1_000, 0)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(checkRateLimit("key", 2, 1_000, 100).allowed).toBe(true);
    expect(checkRateLimit("key", 2, 1_000, 200)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(checkRateLimit("key", 2, 1_000, 1_000).allowed).toBe(true);
  });

  it("bounds attacker-controlled keys and evicts them after expiry", () => {
    for (let index = 0; index < 10_000; index += 1) {
      expect(checkRateLimit(`key-${index}`, 1, 1_000, 0).allowed).toBe(true);
    }
    expect(checkRateLimit("overflow", 1, 1_000, 1)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(checkRateLimit("after-expiry", 1, 1_000, 1_000).allowed).toBe(true);
  });
});
