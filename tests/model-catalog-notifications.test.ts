import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  pending: [] as unknown[],
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  listActivePriceSubscribers: vi.fn(),
  createUnsubscribeToken: vi.fn(),
  reserveEmailDelivery: vi.fn(),
  isEmailDeliverySent: vi.fn(),
  settleEmailDelivery: vi.fn(),
  sendMail: vi.fn(),
  modelCatalogDigestEmail: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDatabase: mocks.getDatabase,
  isDatabaseConfigured: () => true,
}));

vi.mock("@/lib/email/transport", () => ({
  getEmailTransport: () => ({ sendMail: mocks.sendMail }),
  isSmtpConfigured: () => true,
}));

vi.mock("@/lib/email/delivery", () => ({
  isEmailDeliverySent: mocks.isEmailDeliverySent,
  reserveEmailDelivery: mocks.reserveEmailDelivery,
  settleEmailDelivery: mocks.settleEmailDelivery,
}));

vi.mock("@/lib/email/templates", () => ({
  modelCatalogDigestEmail: mocks.modelCatalogDigestEmail,
}));

vi.mock("@/lib/security/tokens", () => ({
  hashEmail: (email: string) => `hash:${email}`,
}));

vi.mock("@/lib/subscriptions/repository", () => ({
  createUnsubscribeToken: mocks.createUnsubscribeToken,
  listActivePriceSubscribers: mocks.listActivePriceSubscribers,
}));

import {
  isModelReleasedOnDetectionDate,
  notifyPendingModelCatalogChanges,
} from "@/lib/model-catalog/notifications";

function event(
  id: string,
  releaseDate: string,
  createdAt = new Date("2026-08-13T16:00:00.000Z"),
) {
  return {
    event: {
      id,
      importId: "import-1",
      eventType: "model_added",
      modelId: `lab/${id}`,
      snapshot: {
        name: id,
        labName: "Lab",
        releaseDate,
      },
      createdAt,
    },
    importId: "import-1",
    version: "catalog-version",
  };
}

describe("model catalog notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_URL", "https://example.com");
    mocks.pending = [];
    mocks.where.mockResolvedValue(undefined);
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.getDatabase.mockReturnValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mocks.pending),
            }),
          }),
        }),
      }),
      update: mocks.update,
    });
    mocks.listActivePriceSubscribers.mockResolvedValue([
      {
        subscriptionId: "subscription-1",
        email: "reader@example.com",
        activeSince: new Date("2026-08-01T00:00:00.000Z"),
        locale: "zh-CN",
      },
    ]);
    mocks.createUnsubscribeToken.mockResolvedValue("unsubscribe-token");
    mocks.reserveEmailDelivery.mockResolvedValue({
      id: "delivery-1",
      reservedAt: new Date("2026-08-13T16:01:00.000Z"),
    });
    mocks.isEmailDeliverySent.mockResolvedValue(false);
    mocks.sendMail.mockResolvedValue({ messageId: "message-1" });
    mocks.modelCatalogDigestEmail.mockReturnValue({
      subject: "New models",
      text: "New models",
      html: "<p>New models</p>",
    });
  });

  it("compares release dates in the Shanghai calendar", () => {
    const detectedAt = new Date("2026-08-13T16:00:00.000Z");

    expect(isModelReleasedOnDetectionDate("2026-08-14", detectedAt)).toBe(true);
    expect(isModelReleasedOnDetectionDate("2026-08-13", detectedAt)).toBe(
      false,
    );
    expect(isModelReleasedOnDetectionDate("2025-03-24", detectedAt)).toBe(
      false,
    );
    expect(isModelReleasedOnDetectionDate("not-a-date", detectedAt)).toBe(
      false,
    );
  });

  it("does not email historical models and marks them processed", async () => {
    mocks.pending = [
      event("historical", "2025-03-24"),
      event("released-today", "2026-08-14"),
    ];

    const sent = await notifyPendingModelCatalogChanges();

    expect(sent).toBe(1);
    expect(mocks.modelCatalogDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        models: [expect.objectContaining({ id: "lab/released-today" })],
      }),
    );
    expect(mocks.modelCatalogDigestEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({
        models: [expect.objectContaining({ id: "lab/historical" })],
      }),
    );
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });
});
