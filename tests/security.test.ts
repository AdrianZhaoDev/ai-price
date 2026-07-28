import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clearRateLimitsForTests,
} from "@/lib/security/rate-limit";
import {
  addHours,
  createOpaqueToken,
  hashEmail,
  hashToken,
  normalizeEmail,
  verifyTokenHash,
} from "@/lib/security/tokens";

describe("security helpers", () => {
  beforeEach(clearRateLimitsForTests);

  it("normalizes and hashes email deterministically", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(hashEmail("User@example.com")).toBe(hashEmail(" user@EXAMPLE.com "));
  });

  it("creates and verifies opaque tokens", () => {
    const token = createOpaqueToken();
    const other = createOpaqueToken();
    const digest = hashToken(token, "a".repeat(32));
    expect(token).toHaveLength(43);
    expect(other).not.toBe(token);
    expect(verifyTokenHash(token, digest, "a".repeat(32))).toBe(true);
    expect(verifyTokenHash(other, digest, "a".repeat(32))).toBe(false);
    expect(verifyTokenHash(token, "bad", "a".repeat(32))).toBe(false);
  });

  it("adds hours without mutating the original date", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    expect(addHours(start, 2).toISOString()).toBe("2026-01-01T02:00:00.000Z");
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("limits requests and resets the window", () => {
    expect(checkRateLimit("ip", 2, 10_000, 1_000).allowed).toBe(true);
    expect(checkRateLimit("ip", 2, 10_000, 2_000).allowed).toBe(true);
    expect(checkRateLimit("ip", 2, 10_000, 2_001)).toEqual({
      allowed: false,
      retryAfterSeconds: 9,
    });
    expect(checkRateLimit("ip", 2, 10_000, 11_000).allowed).toBe(true);
  });
});
