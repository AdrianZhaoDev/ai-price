import {
  checkSubscriptionRateLimit,
  clearSubscriptionRateLimitsForTests,
} from "@/lib/security/subscription-rate-limit";
import { beforeEach, describe, expect, it } from "vitest";

const baseInput = {
  ipAddress: "203.0.113.10",
  email: "first@example.com",
  providerSlug: "chatgpt",
  planSlug: "plus",
};

describe("subscription rate limits", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.LOCAL_DATABASE_URL;
    clearSubscriptionRateLimitsForTests();
  });

  it("requires 60 seconds for the same scope with a different email", async () => {
    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        now: new Date("2026-07-31T00:00:00Z"),
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        email: "second@example.com",
        now: new Date("2026-07-31T00:00:01Z"),
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "same_scope_different_email",
      retryAfterSeconds: 59,
    });
  });

  it("requires 120 seconds when both scope and email change", async () => {
    await checkSubscriptionRateLimit({
      ...baseInput,
      now: new Date("2026-07-31T00:00:00Z"),
    });

    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        email: "second@example.com",
        providerSlug: "claude",
        planSlug: "pro",
        now: new Date("2026-07-31T00:00:30Z"),
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "different_scope_different_email",
      retryAfterSeconds: 90,
    });
  });

  it("requires 10 seconds when the same email changes scope", async () => {
    await checkSubscriptionRateLimit({
      ...baseInput,
      now: new Date("2026-07-31T00:00:00Z"),
    });

    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        providerSlug: "claude",
        planSlug: "pro",
        now: new Date("2026-07-31T00:00:01Z"),
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "different_scope_same_email",
      retryAfterSeconds: 9,
    });
  });

  it("allows an exact duplicate through for duplicate detection", async () => {
    await checkSubscriptionRateLimit({
      ...baseInput,
      now: new Date("2026-07-31T00:00:00Z"),
    });

    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        now: new Date("2026-07-31T00:00:01Z"),
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("caps every IP at ten valid submission attempts in 24 hours", async () => {
    const start = Date.parse("2026-07-31T00:00:00Z");
    for (let index = 0; index < 10; index += 1) {
      await checkSubscriptionRateLimit({
        ...baseInput,
        now: new Date(start + index * 1000),
      });
    }

    const blocked = await checkSubscriptionRateLimit({
      ...baseInput,
      now: new Date(start + 10_000),
    });
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) throw new Error("Expected the IP limit to apply.");
    expect(blocked.reason).toBe("ip_daily");
    expect(blocked.retryAfterSeconds).toBe(86_390);
  });
});
