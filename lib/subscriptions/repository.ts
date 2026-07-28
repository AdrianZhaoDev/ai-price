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
import { and, eq, gt, isNull, or } from "drizzle-orm";

type PendingSubscriptionInput = {
  email: string;
  providerSlug: string;
  planSlug: string | null;
};

type PendingSubscriptionResult = {
  confirmationToken: string;
  unsubscribeToken: string;
  subscriptionId: string;
  email: string;
};

type MemoryToken = {
  subscriptionId: string;
  purpose: "confirm_subscription" | "unsubscribe";
  expiresAt: number;
  consumed: boolean;
};

type MemorySubscription = {
  id: string;
  email: string;
  providerSlug: string;
  planSlug: string;
  status: "pending" | "active" | "unsubscribed";
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
  input: PendingSubscriptionInput,
): Promise<PendingSubscriptionResult> {
  const planSlug = input.planSlug ?? "*";
  const key = memoryScopeKey(input.email, input.providerSlug, planSlug);
  const existing = memorySubscriptions.get(key);
  const subscriptionId = existing?.id ?? crypto.randomUUID();
  const confirmationToken = createOpaqueToken();
  const unsubscribeToken = createOpaqueToken();

  memorySubscriptions.set(key, {
    id: subscriptionId,
    email: normalizeEmail(input.email),
    providerSlug: input.providerSlug,
    planSlug,
    status: existing?.status === "active" ? "active" : "pending",
  });
  memoryTokens.set(hashToken(confirmationToken, emailTokenSecret()), {
    subscriptionId,
    purpose: "confirm_subscription",
    expiresAt: addHours(new Date(), 24).getTime(),
    consumed: false,
  });
  memoryTokens.set(hashToken(unsubscribeToken, emailTokenSecret()), {
    subscriptionId,
    purpose: "unsubscribe",
    expiresAt: addHours(new Date(), 24 * 365).getTime(),
    consumed: false,
  });

  return {
    confirmationToken,
    unsubscribeToken,
    subscriptionId,
    email: normalizeEmail(input.email),
  };
}

export async function createPendingSubscription(
  input: PendingSubscriptionInput,
): Promise<PendingSubscriptionResult> {
  if (!isDatabaseConfigured()) {
    return createMemorySubscription(input);
  }

  const db = getDatabase();
  const email = normalizeEmail(input.email);
  const emailDigest = hashEmail(email);
  const planSlug = input.planSlug ?? "*";
  const confirmationToken = createOpaqueToken();
  const unsubscribeToken = createOpaqueToken();
  const secret = emailTokenSecret();

  return db.transaction(async (tx) => {
    let [subscriber] = await tx
      .select()
      .from(subscribers)
      .where(eq(subscribers.emailHash, emailDigest))
      .limit(1);

    if (!subscriber) {
      [subscriber] = await tx
        .insert(subscribers)
        .values({
          emailNormalized: email,
          emailHash: emailDigest,
        })
        .returning();
    }

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
      .limit(1);

    if (subscription) {
      const alreadyActive = subscription.status === "active";
      [subscription] = await tx
        .update(subscriptions)
        .set({
          status: alreadyActive ? "active" : "pending",
          confirmedAt: alreadyActive ? subscription.confirmedAt : null,
          unsubscribedAt: null,
          updatedAt: new Date(),
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
        })
        .returning();
    }

    await tx.insert(confirmationTokens).values([
      {
        subscriptionId: subscription.id,
        purpose: "confirm_subscription",
        tokenHash: hashToken(confirmationToken, secret),
        expiresAt: addHours(new Date(), 24),
      },
      {
        subscriptionId: subscription.id,
        purpose: "unsubscribe",
        tokenHash: hashToken(unsubscribeToken, secret),
        expiresAt: addHours(new Date(), 24 * 365),
      },
    ]);

    return {
      confirmationToken,
      unsubscribeToken,
      subscriptionId: subscription.id,
      email,
    };
  });
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
  subscription.status =
    purpose === "confirm_subscription" ? "active" : "unsubscribed";
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
      .limit(1);

    if (!token) return false;

    await tx
      .update(confirmationTokens)
      .set({ consumedAt: now })
      .where(eq(confirmationTokens.id, token.id));
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
      .limit(1);

    if (!token) return false;

    await tx
      .update(confirmationTokens)
      .set({ consumedAt: now })
      .where(eq(confirmationTokens.id, token.id));
    await tx
      .update(subscriptions)
      .set({
        status: "unsubscribed",
        unsubscribedAt: now,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, token.subscriptionId));

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
      }));
  }

  return getDatabase()
    .select({
      subscriptionId: subscriptions.id,
      email: subscribers.emailNormalized,
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
): Promise<string> {
  const rawToken = createOpaqueToken();
  const expiresAt = addHours(new Date(), 24 * 365);

  if (!isDatabaseConfigured()) {
    memoryTokens.set(hashToken(rawToken, emailTokenSecret()), {
      subscriptionId,
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
      expiresAt,
    });
  return rawToken;
}
