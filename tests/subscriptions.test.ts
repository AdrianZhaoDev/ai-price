import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmSubscription,
  createActiveSubscription,
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

  it("activates, deduplicates and unsubscribes a scoped subscriber", async () => {
    const created = await createActiveSubscription({
      email: " User@Example.com ",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
    });
    expect(created.email).toBe("user@example.com");
    expect(created.alreadySubscribed).toBe(false);
    if (created.alreadySubscribed)
      throw new Error("Expected a new subscription.");
    expect(created.unsubscribeToken).toBeDefined();
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(1);
    const duplicate = await createActiveSubscription({
      email: "user@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
    });
    expect(duplicate.alreadySubscribed).toBe(true);
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(1);

    const token = await createUnsubscribeToken(created.subscriptionId);
    expect(await unsubscribe(token)).toBe(true);
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(0);

    const reactivated = await createActiveSubscription({
      email: "user@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
    });
    expect(reactivated.alreadySubscribed).toBe(false);
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(1);
  });

  it("rejects wrong tokens and supports provider-wide subscriptions", async () => {
    const created = await createActiveSubscription({
      email: "user@example.com",
      providerSlug: "kimi-membership",
      planSlug: null,
    });
    expect(await confirmSubscription("wrong")).toBe(false);
    if (created.alreadySubscribed)
      throw new Error("Expected a new subscription.");
    expect(
      await listActivePriceSubscribers("kimi-membership", "any-plan"),
    ).toHaveLength(1);
    expect(await unsubscribe(created.unsubscribeToken)).toBe(true);
  });
});
