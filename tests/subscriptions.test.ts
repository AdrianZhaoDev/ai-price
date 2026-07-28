import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmSubscription,
  createPendingSubscription,
  createUnsubscribeToken,
  listActivePriceSubscribers,
  resetMemorySubscriptionsForTests,
  unsubscribe,
} from "@/lib/subscriptions/repository";

describe("memory subscription repository", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("EMAIL_TOKEN_SECRET", "s".repeat(32));
    delete process.env.DATABASE_URL;
    resetMemorySubscriptionsForTests();
  });

  it("confirms, lists and unsubscribes a scoped subscriber", async () => {
    const pending = await createPendingSubscription({
      email: " User@Example.com ",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
    });
    expect(pending.email).toBe("user@example.com");
    expect(await confirmSubscription(pending.confirmationToken)).toBe(true);
    expect(await confirmSubscription(pending.confirmationToken)).toBe(false);
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(1);
    await createPendingSubscription({
      email: "user@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
    });
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(1);

    const token = await createUnsubscribeToken(pending.subscriptionId);
    expect(await unsubscribe(token)).toBe(true);
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(0);
  });

  it("rejects wrong tokens and supports provider-wide subscriptions", async () => {
    const pending = await createPendingSubscription({
      email: "user@example.com",
      providerSlug: "kimi-membership",
      planSlug: null,
    });
    expect(await confirmSubscription("wrong")).toBe(false);
    await confirmSubscription(pending.confirmationToken);
    expect(
      await listActivePriceSubscribers("kimi-membership", "any-plan"),
    ).toHaveLength(1);
    expect(await unsubscribe(pending.unsubscribeToken)).toBe(true);
  });
});
