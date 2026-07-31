import { providerCatalog } from "@/lib/data/catalog";
import {
  requestPriceSubscription,
  sendSubscriptionCreatedEmail,
} from "@/lib/subscriptions/service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createActiveSubscription: vi.fn(),
  loadProviderCatalog: vi.fn(),
  reserveEmailDelivery: vi.fn(),
  settleEmailDelivery: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("@/lib/subscriptions/repository", () => ({
  createActiveSubscription: mocks.createActiveSubscription,
}));

vi.mock("@/lib/pricing/repository", () => ({
  loadProviderCatalog: mocks.loadProviderCatalog,
}));

vi.mock("@/lib/email/transport", () => ({
  getEmailTransport: () => ({ sendMail: mocks.sendMail }),
}));

vi.mock("@/lib/email/delivery", () => ({
  reserveEmailDelivery: mocks.reserveEmailDelivery,
  settleEmailDelivery: mocks.settleEmailDelivery,
}));

describe("subscription service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("SMTP_FROM", "AI Price Atlas <dev@localhost>");
    mocks.createActiveSubscription.mockResolvedValue({
      alreadySubscribed: false,
      unsubscribeToken: "unsubscribe-token",
      subscriptionId: "subscription-id",
      email: "reader@example.com",
    });
    mocks.reserveEmailDelivery.mockResolvedValue("delivery-id");
    mocks.sendMail.mockResolvedValue({ messageId: "test-message" });
  });

  it("accepts a live database plan missing from the static seed", async () => {
    const staticProvider = providerCatalog.find(
      (provider) => provider.id === "chatgpt",
    );
    expect(staticProvider).toBeDefined();
    const baseOffer = staticProvider!.offers[0];
    expect(baseOffer).toBeDefined();

    mocks.loadProviderCatalog.mockResolvedValue([
      {
        ...staticProvider!,
        offers: [
          {
            ...baseOffer,
            id: "chatgpt-go-in",
            planId: "chatgpt-go-monthly",
            planName: "ChatGPT Go",
          },
        ],
      },
    ]);

    const result = await requestPriceSubscription({
      email: "reader@example.com",
      providerId: "chatgpt",
      planId: "chatgpt-go-monthly",
    });

    expect(mocks.loadProviderCatalog).toHaveBeenCalledWith("global", "chatgpt");
    expect(mocks.createActiveSubscription).toHaveBeenCalledWith({
      email: "reader@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-go-monthly",
    });
    expect(result.status).toBe("subscribed");
    expect(mocks.sendMail).not.toHaveBeenCalled();

    if (result.status !== "subscribed") throw new Error("Expected subscribed.");
    expect(result.emailTask.unsubscribeUrl).toBe(
      "http://localhost:3000/api/subscriptions/unsubscribe?token=unsubscribe-token",
    );
    await sendSubscriptionCreatedEmail(result.emailTask);
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(mocks.settleEmailDelivery).toHaveBeenCalledWith("delivery-id", {
      status: "sent",
      providerMessageId: "test-message",
    });
  });

  it("does not schedule another email for an identical active subscription", async () => {
    const staticProvider = providerCatalog.find(
      (provider) => provider.id === "chatgpt",
    );
    mocks.loadProviderCatalog.mockResolvedValue([staticProvider]);
    mocks.createActiveSubscription.mockResolvedValue({
      alreadySubscribed: true,
      subscriptionId: "subscription-id",
      email: "reader@example.com",
    });

    await expect(
      requestPriceSubscription({
        email: "reader@example.com",
        providerId: "chatgpt",
        planId: null,
      }),
    ).resolves.toEqual({ status: "already_subscribed" });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("still rejects an unknown provider before writing or sending", async () => {
    await expect(
      requestPriceSubscription({
        email: "reader@example.com",
        providerId: "unknown-provider",
        planId: null,
      }),
    ).rejects.toThrow("未找到要关注的产品。");

    expect(mocks.createActiveSubscription).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("rejects a plan that does not belong to the selected provider", async () => {
    const staticProvider = providerCatalog.find(
      (provider) => provider.id === "chatgpt",
    );
    expect(staticProvider).toBeDefined();
    mocks.loadProviderCatalog.mockResolvedValue([staticProvider]);

    await expect(
      requestPriceSubscription({
        email: "reader@example.com",
        providerId: "chatgpt",
        planId: "unrelated-plan",
      }),
    ).rejects.toThrow("该套餐不属于所选产品。");

    expect(mocks.createActiveSubscription).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("records a background email failure without changing subscription success", async () => {
    const task = {
      subscriptionId: "subscription-id",
      recipient: "reader@example.com",
      scopeLabel: "ChatGPT",
      unsubscribeUrl:
        "http://localhost:3000/api/subscriptions/unsubscribe?token=token",
    };
    mocks.sendMail.mockRejectedValueOnce(new Error("SMTP timeout"));

    await expect(sendSubscriptionCreatedEmail(task)).rejects.toThrow(
      "SMTP timeout",
    );
    expect(mocks.settleEmailDelivery).toHaveBeenCalledWith("delivery-id", {
      status: "failed",
      error: "SMTP timeout",
    });
  });
});
