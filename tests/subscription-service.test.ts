import { providerCatalog } from "@/lib/data/catalog";
import {
  deliverPendingSubscriptionCreatedEmails,
  requestPriceSubscription,
  sendSubscriptionCreatedEmail,
} from "@/lib/subscriptions/service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimSubscriptionCreatedEmail: vi.fn(),
  createActiveSubscription: vi.fn(),
  createUnsubscribeToken: vi.fn(),
  listPendingSubscriptionEmailIds: vi.fn(),
  loadProviderCatalog: vi.fn(),
  reserveEmailDelivery: vi.fn(),
  settleSubscriptionCreatedEmail: vi.fn(),
  settleEmailDelivery: vi.fn(),
  sendMail: vi.fn(),
}));
const deliveryReservation = {
  id: "delivery-id",
  reservedAt: new Date("2026-07-31T00:00:00.000Z"),
};

vi.mock("@/lib/subscriptions/repository", () => ({
  claimSubscriptionCreatedEmail: mocks.claimSubscriptionCreatedEmail,
  createActiveSubscription: mocks.createActiveSubscription,
  createUnsubscribeToken: mocks.createUnsubscribeToken,
  listPendingSubscriptionEmailIds: mocks.listPendingSubscriptionEmailIds,
  settleSubscriptionCreatedEmail: mocks.settleSubscriptionCreatedEmail,
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
      emailNotificationPending: true,
      subscriptionId: "subscription-id",
    });
    mocks.claimSubscriptionCreatedEmail.mockResolvedValue({
      subscriptionId: "subscription-id",
      email: "reader@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-go-monthly",
      attempt: 1,
      locale: "zh-CN",
    });
    mocks.createUnsubscribeToken.mockResolvedValue("unsubscribe-token");
    mocks.listPendingSubscriptionEmailIds.mockResolvedValue([]);
    mocks.reserveEmailDelivery.mockResolvedValue(deliveryReservation);
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
      locale: "zh-CN",
    });
    expect(result).toEqual({ notificationId: "subscription-id" });
    expect(mocks.sendMail).not.toHaveBeenCalled();

    await sendSubscriptionCreatedEmail(result.notificationId!);
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(mocks.sendMail.mock.calls[0][0].html).toContain(
      "http://localhost:3000/api/subscriptions/unsubscribe?token=unsubscribe-token",
    );
    expect(mocks.settleEmailDelivery).toHaveBeenCalledWith(
      deliveryReservation,
      {
        status: "sent",
        providerMessageId: "test-message",
      },
    );
    expect(mocks.settleSubscriptionCreatedEmail).toHaveBeenCalledWith(
      "subscription-id",
      { status: "sent", attempt: 1 },
    );
  });

  it("does not expose whether an identical active subscription exists", async () => {
    const staticProvider = providerCatalog.find(
      (provider) => provider.id === "chatgpt",
    );
    mocks.loadProviderCatalog.mockResolvedValue([staticProvider]);
    mocks.createActiveSubscription.mockResolvedValue({
      alreadySubscribed: true,
      emailNotificationPending: false,
      subscriptionId: "subscription-id",
    });

    await expect(
      requestPriceSubscription({
        email: "reader@example.com",
        providerId: "chatgpt",
        planId: null,
      }),
    ).resolves.toEqual({ notificationId: undefined });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("uses the persisted English locale for confirmation links and copy", async () => {
    const staticProvider = providerCatalog.find(
      (provider) => provider.id === "chatgpt",
    );
    mocks.loadProviderCatalog.mockResolvedValue([staticProvider]);
    mocks.claimSubscriptionCreatedEmail.mockResolvedValueOnce({
      subscriptionId: "subscription-id",
      email: "reader@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-go-monthly",
      attempt: 1,
      locale: "en",
    });

    await sendSubscriptionCreatedEmail("subscription-id");

    const message = mocks.sendMail.mock.calls[0][0];
    expect(message.html).toContain('<html lang="en">');
    expect(message.text).toContain("http://localhost:3000/en");
    expect(message.text).toContain("locale=en");
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
    mocks.sendMail.mockRejectedValueOnce(new Error("SMTP timeout"));

    await expect(
      sendSubscriptionCreatedEmail("subscription-id"),
    ).rejects.toThrow("SMTP timeout");
    expect(mocks.settleEmailDelivery).toHaveBeenCalledWith(
      deliveryReservation,
      {
        status: "failed",
        error: "SMTP timeout",
      },
    );
    expect(mocks.settleSubscriptionCreatedEmail).toHaveBeenCalledWith(
      "subscription-id",
      { status: "failed", attempt: 1 },
    );
  });

  it("retries persisted pending notifications in the background worker", async () => {
    mocks.listPendingSubscriptionEmailIds.mockResolvedValueOnce([
      "subscription-id",
    ]);

    await expect(deliverPendingSubscriptionCreatedEmails()).resolves.toEqual({
      attempted: 1,
      sent: 1,
      failed: 0,
    });
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });
});
