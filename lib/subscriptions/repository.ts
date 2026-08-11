import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";
import {
  confirmationTokens,
  subscribers,
  subscriptions,
} from "@/lib/db/schema";
import {
  addHours,
  createOpaqueToken,
  hashEmail,
  hashToken,
  normalizeEmail,
} from "@/lib/security/tokens";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Locale } from "@/lib/i18n";

type ActiveSubscriptionInput = {
  email: string;
  providerSlug: string;
  planSlug: string | null;
  locale?: Locale;
};

type ActiveSubscriptionResult = {
  alreadySubscribed: boolean;
  emailNotificationPending: boolean;
  subscriptionId: string;
};

type MemoryToken = {
  subscriptionId: string;
  relatedSubscriptionIds: string[];
  purpose: "confirm_subscription" | "unsubscribe";
  expiresAt: number;
  consumed: boolean;
};

type MemorySubscription = {
  id: string;
  email: string;
  providerSlug: string;
  planSlug: string;
  locale: Locale;
  status: "pending" | "active" | "unsubscribed";
  successEmailPending: boolean;
  successEmailAttempts: number;
  successEmailNextAttemptAt: number | null;
  successEmailLockedAt: number | null;
  successEmailSentAt: number | null;
  activeSince: number;
};

const globalMemory = globalThis as typeof globalThis & {
  __aiPriceMemorySubscriptions?: Map<string, MemorySubscription>;
  __aiPriceMemoryTokens?: Map<string, MemoryToken>;
};

const memorySubscriptions =
  globalMemory.__aiPriceMemorySubscriptions ??
  (globalMemory.__aiPriceMemorySubscriptions = new Map());
const memoryTokens =
  globalMemory.__aiPriceMemoryTokens ??
  (globalMemory.__aiPriceMemoryTokens = new Map());

export function emailTokenSecret(): string {
  const secret = process.env.EMAIL_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "EMAIL_TOKEN_SECRET must contain at least 32 characters.",
      );
    }
    return "development-only-email-token-secret-32";
  }
  return secret;
}

function memoryScopeKey(
  email: string,
  providerSlug: string,
  planSlug: string,
): string {
  return `${normalizeEmail(email)}:${providerSlug}:${planSlug}`;
}

async function createMemorySubscription(
  input: ActiveSubscriptionInput,
): Promise<ActiveSubscriptionResult> {
  const planSlug = input.planSlug ?? "*";
  const key = memoryScopeKey(input.email, input.providerSlug, planSlug);
  const existing = memorySubscriptions.get(key);
  const subscriptionId = existing?.id ?? crypto.randomUUID();
  const alreadySubscribed = existing?.status === "active";
  const locale = input.locale ?? "zh-CN";
  const emailNotificationPending = alreadySubscribed
    ? (existing.successEmailPending ?? false)
    : true;

  memorySubscriptions.set(key, {
    id: subscriptionId,
    email: normalizeEmail(input.email),
    providerSlug: input.providerSlug,
    planSlug,
    locale,
    status: "active",
    successEmailPending: emailNotificationPending,
    successEmailAttempts: alreadySubscribed
      ? (existing.successEmailAttempts ?? 0)
      : 0,
    successEmailNextAttemptAt: alreadySubscribed
      ? (existing.successEmailNextAttemptAt ?? null)
      : Date.now(),
    successEmailLockedAt: alreadySubscribed
      ? (existing.successEmailLockedAt ?? null)
      : null,
    successEmailSentAt: alreadySubscribed
      ? (existing.successEmailSentAt ?? null)
      : null,
    activeSince: alreadySubscribed
      ? (existing.activeSince ?? Date.now())
      : Date.now(),
  });

  return {
    alreadySubscribed,
    emailNotificationPending,
    subscriptionId,
  };
}

export async function createActiveSubscription(
  input: ActiveSubscriptionInput,
): Promise<ActiveSubscriptionResult> {
  if (!isDatabaseConfigured()) {
    return createMemorySubscription(input);
  }

  const db = getDatabase();
  const now = new Date();
  const email = normalizeEmail(input.email);
  const emailDigest = hashEmail(email);
  const planSlug = input.planSlug ?? "*";

  return db.transaction(async (tx) => {
    const [subscriber] = await tx
      .insert(subscribers)
      .values({
        emailNormalized: email,
        emailHash: emailDigest,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: subscribers.emailHash,
        set: {
          emailNormalized: email,
          updatedAt: now,
        },
      })
      .returning();

    let [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.subscriberId, subscriber.id),
          eq(subscriptions.providerSlug, input.providerSlug),
          eq(subscriptions.planSlug, planSlug),
        ),
      )
      .limit(1)
      .for("update");

    const alreadySubscribed = subscription?.status === "active";
    if (alreadySubscribed) {
      if (subscription.locale !== (input.locale ?? "zh-CN")) {
        await tx
          .update(subscriptions)
          .set({ locale: input.locale ?? "zh-CN", updatedAt: now })
          .where(eq(subscriptions.id, subscription.id));
      }
      return {
        alreadySubscribed: true,
        emailNotificationPending: subscription.successEmailPending,
        subscriptionId: subscription.id,
      };
    }

    if (subscription) {
      [subscription] = await tx
        .update(subscriptions)
        .set({
          status: "active",
          locale: input.locale ?? "zh-CN",
          confirmedAt: now,
          unsubscribedAt: null,
          successEmailPending: true,
          successEmailAttempts: 0,
          successEmailNextAttemptAt: now,
          successEmailLockedAt: null,
          successEmailSentAt: null,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, subscription.id))
        .returning();
    } else {
      [subscription] = await tx
        .insert(subscriptions)
        .values({
          subscriberId: subscriber.id,
          providerSlug: input.providerSlug,
          planSlug,
          status: "active",
          locale: input.locale ?? "zh-CN",
          confirmedAt: now,
          successEmailPending: true,
          successEmailAttempts: 0,
          successEmailNextAttemptAt: now,
        })
        .returning();
    }

    return {
      alreadySubscribed: false,
      emailNotificationPending: true,
      subscriptionId: subscription.id,
    };
  });
}

const SUCCESS_EMAIL_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

export type SubscriptionEmailClaim = {
  subscriptionId: string;
  email: string;
  providerSlug: string;
  planSlug: string;
  attempt: number;
  locale: Locale;
};

function canClaimSuccessEmail(
  subscription: MemorySubscription,
  nowMs: number,
): boolean {
  return (
    subscription.status === "active" &&
    subscription.successEmailPending &&
    (subscription.successEmailNextAttemptAt === null ||
      subscription.successEmailNextAttemptAt <= nowMs) &&
    (subscription.successEmailLockedAt === null ||
      subscription.successEmailLockedAt <=
        nowMs - SUCCESS_EMAIL_CLAIM_TIMEOUT_MS)
  );
}

export async function claimSubscriptionCreatedEmail(
  subscriptionId: string,
  now = new Date(),
): Promise<SubscriptionEmailClaim | null> {
  if (!isDatabaseConfigured()) {
    const subscription = [...memorySubscriptions.values()].find(
      (candidate) => candidate.id === subscriptionId,
    );
    if (!subscription || !canClaimSuccessEmail(subscription, now.getTime())) {
      return null;
    }
    subscription.successEmailAttempts += 1;
    subscription.successEmailLockedAt = now.getTime();
    return {
      subscriptionId,
      email: subscription.email,
      providerSlug: subscription.providerSlug,
      planSlug: subscription.planSlug,
      attempt: subscription.successEmailAttempts,
      locale: subscription.locale,
    };
  }

  const staleBefore = new Date(now.getTime() - SUCCESS_EMAIL_CLAIM_TIMEOUT_MS);
  const [claimed] = await getDatabase()
    .update(subscriptions)
    .set({
      successEmailAttempts: sql`${subscriptions.successEmailAttempts} + 1`,
      successEmailLockedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.status, "active"),
        eq(subscriptions.successEmailPending, true),
        or(
          isNull(subscriptions.successEmailNextAttemptAt),
          lte(subscriptions.successEmailNextAttemptAt, now),
        ),
        or(
          isNull(subscriptions.successEmailLockedAt),
          lte(subscriptions.successEmailLockedAt, staleBefore),
        ),
      ),
    )
    .returning({
      id: subscriptions.id,
      providerSlug: subscriptions.providerSlug,
      planSlug: subscriptions.planSlug,
      attempt: subscriptions.successEmailAttempts,
      locale: sql<Locale>`case when ${subscriptions.locale} = 'en' then 'en' else 'zh-CN' end`,
      subscriberId: subscriptions.subscriberId,
    });
  if (!claimed) return null;

  const [subscriber] = await getDatabase()
    .select({ email: subscribers.emailNormalized })
    .from(subscribers)
    .where(eq(subscribers.id, claimed.subscriberId))
    .limit(1);
  if (!subscriber) return null;

  return {
    subscriptionId: claimed.id,
    email: subscriber.email,
    providerSlug: claimed.providerSlug,
    planSlug: claimed.planSlug ?? "*",
    attempt: claimed.attempt,
    locale: claimed.locale === "en" ? "en" : "zh-CN",
  };
}

export async function settleSubscriptionCreatedEmail(
  subscriptionId: string,
  input: { status: "sent" | "failed"; attempt: number },
  now = new Date(),
): Promise<void> {
  const retryDelayMinutes = Math.min(60, 2 ** Math.max(0, input.attempt - 1));
  const nextAttemptAt =
    input.status === "failed"
      ? new Date(now.getTime() + retryDelayMinutes * 60 * 1000)
      : null;

  if (!isDatabaseConfigured()) {
    const subscription = [...memorySubscriptions.values()].find(
      (candidate) => candidate.id === subscriptionId,
    );
    if (
      !subscription ||
      !subscription.successEmailPending ||
      subscription.successEmailAttempts !== input.attempt
    ) {
      return;
    }
    subscription.successEmailPending = input.status === "failed";
    subscription.successEmailLockedAt = null;
    subscription.successEmailNextAttemptAt = nextAttemptAt?.getTime() ?? null;
    subscription.successEmailSentAt =
      input.status === "sent" ? now.getTime() : null;
    return;
  }

  await getDatabase()
    .update(subscriptions)
    .set({
      successEmailPending: input.status === "failed",
      successEmailLockedAt: null,
      successEmailNextAttemptAt: nextAttemptAt,
      successEmailSentAt: input.status === "sent" ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.successEmailPending, true),
        eq(subscriptions.successEmailAttempts, input.attempt),
      ),
    );
}

export async function listPendingSubscriptionEmailIds(
  limit = 20,
  now = new Date(),
): Promise<string[]> {
  if (!isDatabaseConfigured()) {
    return [...memorySubscriptions.values()]
      .filter((subscription) =>
        canClaimSuccessEmail(subscription, now.getTime()),
      )
      .slice(0, limit)
      .map((subscription) => subscription.id);
  }

  const staleBefore = new Date(now.getTime() - SUCCESS_EMAIL_CLAIM_TIMEOUT_MS);
  const rows = await getDatabase()
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        eq(subscriptions.successEmailPending, true),
        or(
          isNull(subscriptions.successEmailNextAttemptAt),
          lte(subscriptions.successEmailNextAttemptAt, now),
        ),
        or(
          isNull(subscriptions.successEmailLockedAt),
          lte(subscriptions.successEmailLockedAt, staleBefore),
        ),
      ),
    )
    .orderBy(
      asc(subscriptions.successEmailNextAttemptAt),
      asc(subscriptions.createdAt),
    )
    .limit(limit);
  return rows.map((row) => row.id);
}

async function consumeMemoryToken(
  rawToken: string,
  purpose: MemoryToken["purpose"],
): Promise<boolean> {
  const token = memoryTokens.get(hashToken(rawToken, emailTokenSecret()));
  if (
    !token ||
    token.purpose !== purpose ||
    token.consumed ||
    token.expiresAt <= Date.now()
  ) {
    return false;
  }

  const subscription = [...memorySubscriptions.values()].find(
    (candidate) => candidate.id === token.subscriptionId,
  );
  if (!subscription) return false;

  token.consumed = true;
  if (
    purpose === "confirm_subscription" &&
    subscription.status === "unsubscribed"
  ) {
    return false;
  }
  subscription.status =
    purpose === "confirm_subscription" ? "active" : "unsubscribed";
  if (purpose === "unsubscribe") {
    const targetIds = new Set([
      token.subscriptionId,
      ...token.relatedSubscriptionIds,
    ]);
    for (const target of memorySubscriptions.values()) {
      if (!targetIds.has(target.id)) continue;
      target.status = "unsubscribed";
      target.successEmailPending = false;
      target.successEmailLockedAt = null;
      target.successEmailNextAttemptAt = null;
    }
  }
  return true;
}

export async function confirmSubscription(rawToken: string): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    return consumeMemoryToken(rawToken, "confirm_subscription");
  }

  const db = getDatabase();
  const now = new Date();
  const tokenDigest = hashToken(rawToken, emailTokenSecret());

  return db.transaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(confirmationTokens)
      .where(
        and(
          eq(confirmationTokens.tokenHash, tokenDigest),
          eq(confirmationTokens.purpose, "confirm_subscription"),
          isNull(confirmationTokens.consumedAt),
          gt(confirmationTokens.expiresAt, now),
        ),
      )
      .limit(1)
      .for("update");

    if (!token) return false;

    const [subscription] = await tx
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.id, token.subscriptionId))
      .limit(1)
      .for("update");

    await tx
      .update(confirmationTokens)
      .set({ consumedAt: now })
      .where(eq(confirmationTokens.id, token.id));
    if (!subscription || subscription.status === "unsubscribed") {
      return false;
    }
    await tx
      .update(subscriptions)
      .set({
        status: "active",
        confirmedAt: now,
        unsubscribedAt: null,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, token.subscriptionId));

    return true;
  });
}

export async function unsubscribe(rawToken: string): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    return consumeMemoryToken(rawToken, "unsubscribe");
  }

  const db = getDatabase();
  const now = new Date();
  const tokenDigest = hashToken(rawToken, emailTokenSecret());

  return db.transaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(confirmationTokens)
      .where(
        and(
          eq(confirmationTokens.tokenHash, tokenDigest),
          eq(confirmationTokens.purpose, "unsubscribe"),
          isNull(confirmationTokens.consumedAt),
          gt(confirmationTokens.expiresAt, now),
        ),
      )
      .limit(1)
      .for("update");

    if (!token) return false;

    await tx
      .update(confirmationTokens)
      .set({ consumedAt: now })
      .where(eq(confirmationTokens.id, token.id));
    const subscriptionIds = [
      token.subscriptionId,
      ...token.relatedSubscriptionIds,
    ];
    await tx
      .update(subscriptions)
      .set({
        status: "unsubscribed",
        unsubscribedAt: now,
        successEmailPending: false,
        successEmailNextAttemptAt: null,
        successEmailLockedAt: null,
        updatedAt: now,
      })
      .where(inArray(subscriptions.id, subscriptionIds));

    return true;
  });
}

export function resetMemorySubscriptionsForTests(): void {
  memorySubscriptions.clear();
  memoryTokens.clear();
}

export type ActivePriceSubscriber = {
  subscriptionId: string;
  email: string;
  activeSince: Date;
  locale: Locale;
};

export async function listActivePriceSubscribers(
  providerSlug: string,
  planSlug: string,
): Promise<ActivePriceSubscriber[]> {
  if (!isDatabaseConfigured()) {
    return [...memorySubscriptions.values()]
      .filter(
        (subscription) =>
          subscription.status === "active" &&
          subscription.providerSlug === providerSlug &&
          (subscription.planSlug === "*" || subscription.planSlug === planSlug),
      )
      .map((subscription) => ({
        subscriptionId: subscription.id,
        email: subscription.email,
        activeSince: new Date(subscription.activeSince),
        locale: subscription.locale,
      }));
  }

  return getDatabase()
    .select({
      subscriptionId: subscriptions.id,
      email: subscribers.emailNormalized,
      activeSince: sql<Date>`coalesce(${subscriptions.confirmedAt}, ${subscriptions.createdAt})`,
      locale: sql<Locale>`case when ${subscriptions.locale} = 'en' then 'en' else 'zh-CN' end`,
    })
    .from(subscriptions)
    .innerJoin(subscribers, eq(subscriptions.subscriberId, subscribers.id))
    .where(
      and(
        eq(subscriptions.status, "active"),
        eq(subscriptions.providerSlug, providerSlug),
        or(
          eq(subscriptions.planSlug, "*"),
          eq(subscriptions.planSlug, planSlug),
        ),
      ),
    );
}

export async function createUnsubscribeToken(
  subscriptionId: string,
  relatedSubscriptionIds: string[] = [],
): Promise<string> {
  const rawToken = createOpaqueToken();
  const expiresAt = addHours(new Date(), 24 * 365);
  const relatedIds = [...new Set(relatedSubscriptionIds)].filter(
    (id) => id !== subscriptionId,
  );

  if (!isDatabaseConfigured()) {
    memoryTokens.set(hashToken(rawToken, emailTokenSecret()), {
      subscriptionId,
      relatedSubscriptionIds: relatedIds,
      purpose: "unsubscribe",
      expiresAt: expiresAt.getTime(),
      consumed: false,
    });
    return rawToken;
  }

  await getDatabase()
    .insert(confirmationTokens)
    .values({
      subscriptionId,
      purpose: "unsubscribe",
      tokenHash: hashToken(rawToken, emailTokenSecret()),
      relatedSubscriptionIds: relatedIds,
      expiresAt,
    });
  return rawToken;
}
