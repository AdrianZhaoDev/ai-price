import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDatabase: mocks.getDatabase,
  isDatabaseConfigured: () => true,
}));

import { listActivePriceSubscribers } from "@/lib/subscriptions/repository";

describe("database subscription repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockResolvedValue([
      {
        subscriptionId: "confirmed-subscription",
        email: "confirmed@example.com",
        confirmedAt: new Date("2026-08-12T20:04:27.027Z"),
        createdAt: new Date("2026-08-12T20:04:20.000Z"),
        locale: "zh-CN",
      },
      {
        subscriptionId: "unconfirmed-subscription",
        email: "unconfirmed@example.com",
        confirmedAt: null,
        createdAt: new Date("2026-08-12T20:04:30.000Z"),
        locale: "en-US",
      },
    ]);
    mocks.innerJoin.mockReturnValue({ where: mocks.where });
    mocks.from.mockReturnValue({ innerJoin: mocks.innerJoin });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.getDatabase.mockReturnValue({ select: mocks.select });
  });

  it("returns parsed subscription activation dates for catalog notifications", async () => {
    const subscribers = await listActivePriceSubscribers("api-model-new", "*");

    expect(subscribers).toEqual([
      {
        subscriptionId: "confirmed-subscription",
        email: "confirmed@example.com",
        activeSince: new Date("2026-08-12T20:04:27.027Z"),
        locale: "zh-CN",
      },
      {
        subscriptionId: "unconfirmed-subscription",
        email: "unconfirmed@example.com",
        activeSince: new Date("2026-08-12T20:04:30.000Z"),
        locale: "zh-CN",
      },
    ]);
    expect(subscribers[0]?.activeSince).toBeInstanceOf(Date);
    expect(subscribers[1]?.activeSince).toBeInstanceOf(Date);
  });
});
