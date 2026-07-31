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
      status: "subscribed",
      emailTask: {
        subscriptionId: "subscription-id",
        recipient: "reader@example.com",
        scopeLabel: "ChatGPT",
        unsubscribeUrl:
          "http://localhost:3100/api/subscriptions/unsubscribe?token=test",
      },
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

  it("returns a duplicate notice without scheduling email", async () => {
    mocks.requestPriceSubscription.mockResolvedValueOnce({
      status: "already_subscribed",
    });

    const response = await POST(subscriptionRequest());

    await expect(response.json()).resolves.toEqual({
      status: "already_subscribed",
      message: "您已订阅，请勿重复订阅。",
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns the applicable interval and Retry-After when rate limited", async () => {
    mocks.checkSubscriptionRateLimit.mockResolvedValueOnce({
      allowed: false,
      reason: "different_scope_same_email",
      retryAfterSeconds: 7,
    });

    const response = await POST(subscriptionRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    await expect(response.json()).resolves.toEqual({
      message: "同一邮箱更换关注时需间隔 10 秒，请在 7 秒后再试。",
    });
    expect(mocks.requestPriceSubscription).not.toHaveBeenCalled();
  });
});
