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

  it("requires 20 seconds for the same scope with a different email", async () => {
    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        now: new Date("2026-07-31T00:00:00Z"),
      }),
    ).resolves.toMatchObject({ allowed: true, retryAfterSeconds: 0 });

    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        email: "second@example.com",
        now: new Date("2026-07-31T00:00:01Z"),
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "same_scope_different_email",
      retryAfterSeconds: 19,
    });
  });

  it("requires 300 seconds when both scope and email change", async () => {
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
      retryAfterSeconds: 270,
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

  it("measures the cooldown from the latest accepted click only", async () => {
    const startedAt = Date.parse("2026-07-31T00:00:00Z");
    await checkSubscriptionRateLimit({
      ...baseInput,
      now: new Date(startedAt),
    });
    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        providerSlug: "claude",
        planSlug: "pro",
        now: new Date(startedAt + 10_000),
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        email: "second@example.com",
        providerSlug: "claude",
        planSlug: "pro",
        now: new Date(startedAt + 11_000),
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "same_scope_different_email",
      retryAfterSeconds: 19,
    });
  });

  it("does not restart the cooldown after a blocked click", async () => {
    const startedAt = Date.parse("2026-07-31T00:00:00Z");
    await checkSubscriptionRateLimit({
      ...baseInput,
      now: new Date(startedAt),
    });

    const changedInput = {
      ...baseInput,
      email: "second@example.com",
      providerSlug: "claude",
      planSlug: "pro",
    };
    await expect(
      checkSubscriptionRateLimit({
        ...changedInput,
        now: new Date(startedAt + 100_000),
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "different_scope_different_email",
      retryAfterSeconds: 200,
    });
    await expect(
      checkSubscriptionRateLimit({
        ...changedInput,
        now: new Date(startedAt + 150_000),
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "different_scope_different_email",
      retryAfterSeconds: 150,
    });
  });

  it("caps every IP at ten submission attempts in five hours", async () => {
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
    expect(blocked.reason).toBe("ip_window");
    expect(blocked.retryAfterSeconds).toBe(17_990);
    expect(blocked.rankingFallbackAllowed).toBe(true);
  });

  it("allows exactly one ranking fallback after the IP cap", async () => {
    const start = Date.parse("2026-07-31T00:00:00Z");
    for (let index = 0; index < 10; index += 1) {
      await checkSubscriptionRateLimit({
        ...baseInput,
        now: new Date(start + index * 1000),
      });
    }

    const [firstFallback, concurrentFallback] = await Promise.all([
      checkSubscriptionRateLimit({
        ...baseInput,
        providerSlug: "api-model-new",
        planSlug: "*",
        rankingFallback: true,
        now: new Date(start + 11_000),
      }),
      checkSubscriptionRateLimit({
        ...baseInput,
        providerSlug: "api-model-new",
        planSlug: "*",
        rankingFallback: true,
        now: new Date(start + 11_000),
      }),
    ]);
    expect(firstFallback).toMatchObject({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(concurrentFallback).toMatchObject({
      allowed: false,
      reason: "ip_window",
      rankingFallbackAllowed: false,
    });
  });

  it("opens a new ten-attempt window after five hours", async () => {
    const start = Date.parse("2026-07-31T00:00:00Z");
    for (let index = 0; index < 10; index += 1) {
      await checkSubscriptionRateLimit({
        ...baseInput,
        now: new Date(start + index * 1000),
      });
    }

    await expect(
      checkSubscriptionRateLimit({
        ...baseInput,
        now: new Date(start + 5 * 60 * 60 * 1000 + 1),
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });
});
