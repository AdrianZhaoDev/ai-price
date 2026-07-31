import { providerCatalog } from "@/lib/data/catalog";
import { requestPriceSubscription } from "@/lib/subscriptions/service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPendingSubscription: vi.fn(),
  loadProviderCatalog: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("@/lib/subscriptions/repository", () => ({
  createPendingSubscription: mocks.createPendingSubscription,
}));

vi.mock("@/lib/pricing/repository", () => ({
  loadProviderCatalog: mocks.loadProviderCatalog,
}));

vi.mock("@/lib/email/transport", () => ({
  getEmailTransport: () => ({ sendMail: mocks.sendMail }),
}));

describe("subscription service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("SMTP_FROM", "AI Price Atlas <dev@localhost>");
    mocks.createPendingSubscription.mockResolvedValue({
      confirmationToken: "confirm-token",
      unsubscribeToken: "unsubscribe-token",
      subscriptionId: "subscription-id",
      email: "reader@example.com",
    });
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
    expect(mocks.createPendingSubscription).toHaveBeenCalledWith({
      email: "reader@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-go-monthly",
    });
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(result.previewConfirmUrl).toContain(
      "/api/subscriptions/confirm?token=confirm-token",
    );
  });

  it("still rejects an unknown provider before writing or sending", async () => {
    await expect(
      requestPriceSubscription({
        email: "reader@example.com",
        providerId: "unknown-provider",
        planId: null,
      }),
    ).rejects.toThrow("未找到要关注的产品。");

    expect(mocks.createPendingSubscription).not.toHaveBeenCalled();
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

    expect(mocks.createPendingSubscription).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
