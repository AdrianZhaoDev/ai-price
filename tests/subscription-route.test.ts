import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  afterCallback: undefined as undefined | (() => Promise<void>),
  checkSubscriptionRateLimit: vi.fn(),
  requestPriceSubscription: vi.fn(),
  sendSubscriptionCreatedEmail: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: mocks.after,
  };
});

vi.mock("@/lib/security/subscription-rate-limit", () => ({
  checkSubscriptionRateLimit: mocks.checkSubscriptionRateLimit,
}));

vi.mock("@/lib/subscriptions/service", () => ({
  requestPriceSubscription: mocks.requestPriceSubscription,
  sendSubscriptionCreatedEmail: mocks.sendSubscriptionCreatedEmail,
}));

import { POST } from "@/app/api/subscriptions/route";

function subscriptionRequest() {
  return new NextRequest("http://localhost:3100/api/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
    },
    body: JSON.stringify({
      email: "reader@example.com",
      providerId: "chatgpt",
      planId: null,
    }),
  });
}

describe("subscription route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallback = undefined;
    mocks.after.mockImplementation((callback: () => Promise<void>) => {
      mocks.afterCallback = callback;
    });
    mocks.checkSubscriptionRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
    mocks.requestPriceSubscription.mockResolvedValue({
      notificationId: "subscription-id",
    });
    mocks.sendSubscriptionCreatedEmail.mockResolvedValue(undefined);
  });

  it("returns success before running the background email task", async () => {
    const response = await POST(subscriptionRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "subscribed",
      message: "您已订阅成功！",
    });
    expect(mocks.sendSubscriptionCreatedEmail).not.toHaveBeenCalled();
    expect(mocks.afterCallback).toBeTypeOf("function");

    await mocks.afterCallback!();
    expect(mocks.sendSubscriptionCreatedEmail).toHaveBeenCalledOnce();
  });

  it("does not disclose a duplicate subscription", async () => {
    mocks.requestPriceSubscription.mockResolvedValueOnce({
      notificationId: undefined,
    });

    const response = await POST(subscriptionRequest());

    await expect(response.json()).resolves.toEqual({
      status: "subscribed",
      message: "您已订阅成功！",
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each([
    {
      reason: "same_scope_different_email" as const,
      retryAfterSeconds: 17,
      message: "同一关注使用不同邮箱时需间隔 20 秒，请在 17 秒后再试。",
    },
    {
      reason: "different_scope_different_email" as const,
      retryAfterSeconds: 251,
      message: "同时更换关注和邮箱时需间隔 300 秒，请在 251 秒后再试。",
    },
    {
      reason: "different_scope_same_email" as const,
      retryAfterSeconds: 7,
      message: "同一邮箱更换关注时需间隔 10 秒，请在 7 秒后再试。",
    },
  ])(
    "returns the $reason interval and Retry-After when rate limited",
    async ({ reason, retryAfterSeconds, message }) => {
      mocks.checkSubscriptionRateLimit.mockResolvedValueOnce({
        allowed: false,
        reason,
        retryAfterSeconds,
      });

      const response = await POST(subscriptionRequest());

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe(
        String(retryAfterSeconds),
      );
      await expect(response.json()).resolves.toEqual({ message });
      expect(mocks.requestPriceSubscription).not.toHaveBeenCalled();
    },
  );
});
