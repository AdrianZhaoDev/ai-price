import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimSubscriptionCreatedEmail,
  confirmSubscription,
  createActiveSubscription,
  createUnsubscribeToken,
  listActivePriceSubscribers,
  listPendingSubscriptionEmailIds,
  resetMemorySubscriptionsForTests,
  settleSubscriptionCreatedEmail,
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
    expect(created.alreadySubscribed).toBe(false);
    expect(created.emailNotificationPending).toBe(true);
    expect(await listPendingSubscriptionEmailIds()).toEqual([
      created.subscriptionId,
    ]);

    const claim = await claimSubscriptionCreatedEmail(created.subscriptionId);
    expect(claim).toMatchObject({
      email: "user@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
      attempt: 1,
    });
    expect(claim).not.toBeNull();
    await settleSubscriptionCreatedEmail(created.subscriptionId, {
      status: "sent",
      attempt: claim!.attempt,
    });
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(1);
    const duplicate = await createActiveSubscription({
      email: "user@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
    });
    expect(duplicate.alreadySubscribed).toBe(true);
    expect(duplicate.emailNotificationPending).toBe(false);
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
    expect(reactivated.emailNotificationPending).toBe(true);
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
    expect(
      await listActivePriceSubscribers("kimi-membership", "any-plan"),
    ).toHaveLength(1);
    const token = await createUnsubscribeToken(created.subscriptionId);
    expect(await unsubscribe(token)).toBe(true);
    expect(await listPendingSubscriptionEmailIds()).toEqual([]);
  });

  it("unsubscribes every overlapping scope represented by one email", async () => {
    const broad = await createActiveSubscription({
      email: "reader@example.com",
      providerSlug: "chatgpt",
      planSlug: null,
    });
    const exact = await createActiveSubscription({
      email: "reader@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
    });
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toHaveLength(2);

    const token = await createUnsubscribeToken(broad.subscriptionId, [
      exact.subscriptionId,
    ]);
    expect(await unsubscribe(token)).toBe(true);
    expect(
      await listActivePriceSubscribers("chatgpt", "chatgpt-plus-monthly"),
    ).toEqual([]);
  });

  it("reclaims interrupted and failed success-email deliveries", async () => {
    const created = await createActiveSubscription({
      email: "reader@example.com",
      providerSlug: "chatgpt",
      planSlug: "chatgpt-plus-monthly",
    });
    const startedAt = new Date();
    const firstClaim = await claimSubscriptionCreatedEmail(
      created.subscriptionId,
      startedAt,
    );
    expect(firstClaim?.attempt).toBe(1);
    expect(
      await listPendingSubscriptionEmailIds(
        20,
        new Date(startedAt.getTime() + 5 * 60 * 1000),
      ),
    ).toEqual([]);
    expect(
      await listPendingSubscriptionEmailIds(
        20,
        new Date(startedAt.getTime() + 11 * 60 * 1000),
      ),
    ).toEqual([created.subscriptionId]);

    const secondClaim = await claimSubscriptionCreatedEmail(
      created.subscriptionId,
      new Date(startedAt.getTime() + 11 * 60 * 1000),
    );
    expect(secondClaim?.attempt).toBe(2);
    await settleSubscriptionCreatedEmail(
      created.subscriptionId,
      { status: "sent", attempt: 1 },
      new Date(startedAt.getTime() + 11 * 60 * 1000),
    );
    await settleSubscriptionCreatedEmail(
      created.subscriptionId,
      { status: "failed", attempt: 2 },
      new Date(startedAt.getTime() + 11 * 60 * 1000),
    );
    expect(
      await listPendingSubscriptionEmailIds(
        20,
        new Date(startedAt.getTime() + 12 * 60 * 1000),
      ),
    ).toEqual([]);
    expect(
      await listPendingSubscriptionEmailIds(
        20,
        new Date(startedAt.getTime() + 13 * 60 * 1000),
      ),
    ).toEqual([created.subscriptionId]);
  });
});
