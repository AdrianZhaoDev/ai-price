import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { subscriptionAttempts } from "@/lib/db/schema";
import { hashEmail, hashValue } from "@/lib/security/tokens";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";

const SAME_SCOPE_DIFFERENT_EMAIL_MS = 20 * 1000;
const DIFFERENT_SCOPE_DIFFERENT_EMAIL_MS = 300 * 1000;
const DIFFERENT_SCOPE_SAME_EMAIL_MS = 10 * 1000;
const IP_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const IP_DAILY_LIMIT = 10;

export type SubscriptionRateLimitReason =
  | "same_scope_different_email"
  | "different_scope_different_email"
  | "different_scope_same_email"
  | "ip_daily";

export type SubscriptionRateLimitResult =
  | { allowed: true; retryAfterSeconds: 0 }
  | {
      allowed: false;
      reason: SubscriptionRateLimitReason;
      retryAfterSeconds: number;
    };

type SubscriptionRateLimitInput = {
  ipAddress: string;
  email: string;
  providerSlug: string;
  planSlug: string | null;
  now?: Date;
};

type Attempt = {
  emailHash: string;
  providerSlug: string;
  planSlug: string;
  accepted: boolean;
  createdAt: Date;
};

const globalAttempts = globalThis as typeof globalThis & {
  __aiPriceSubscriptionAttempts?: Map<string, Attempt[]>;
};

const memoryAttempts: Map<string, Attempt[]> =
  globalAttempts.__aiPriceSubscriptionAttempts ??
  (globalAttempts.__aiPriceSubscriptionAttempts = new Map<string, Attempt[]>());

function secondsRemaining(deadline: number, now: number): number {
  return Math.max(1, Math.ceil((deadline - now) / 1000));
}

function evaluateAttempt(
  attempts: Attempt[],
  current: Omit<Attempt, "accepted" | "createdAt">,
  now: Date,
): SubscriptionRateLimitResult {
  const nowMs = now.getTime();
  const withinDay = attempts.filter(
    (attempt) => attempt.createdAt.getTime() > nowMs - IP_DAILY_WINDOW_MS,
  );

  if (withinDay.length >= IP_DAILY_LIMIT) {
    const oldest = withinDay.reduce((earliest, attempt) =>
      attempt.createdAt < earliest.createdAt ? attempt : earliest,
    );
    return {
      allowed: false,
      reason: "ip_daily",
      retryAfterSeconds: secondsRemaining(
        oldest.createdAt.getTime() + IP_DAILY_WINDOW_MS,
        nowMs,
      ),
    };
  }

  const previousAcceptedAttempt = withinDay
    .filter((attempt) => attempt.accepted)
    .reduce<Attempt | undefined>(
      (latest, attempt) =>
        !latest || attempt.createdAt > latest.createdAt ? attempt : latest,
      undefined,
    );
  if (!previousAcceptedAttempt) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const sameScope =
    previousAcceptedAttempt.providerSlug === current.providerSlug &&
    previousAcceptedAttempt.planSlug === current.planSlug;
  const sameEmail = previousAcceptedAttempt.emailHash === current.emailHash;
  let reason: Exclude<SubscriptionRateLimitReason, "ip_daily"> | undefined;
  let intervalMs = 0;

  if (sameScope && !sameEmail) {
    reason = "same_scope_different_email";
    intervalMs = SAME_SCOPE_DIFFERENT_EMAIL_MS;
  } else if (!sameScope && !sameEmail) {
    reason = "different_scope_different_email";
    intervalMs = DIFFERENT_SCOPE_DIFFERENT_EMAIL_MS;
  } else if (!sameScope && sameEmail) {
    reason = "different_scope_same_email";
    intervalMs = DIFFERENT_SCOPE_SAME_EMAIL_MS;
  }

  if (!reason) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const deadline = previousAcceptedAttempt.createdAt.getTime() + intervalMs;
  if (deadline <= nowMs) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    reason,
    retryAfterSeconds: secondsRemaining(deadline, nowMs),
  };
}

export async function checkSubscriptionRateLimit(
  input: SubscriptionRateLimitInput,
): Promise<SubscriptionRateLimitResult> {
  const now = input.now ?? new Date();
  const ipHash = hashValue(input.ipAddress.trim() || "unknown");
  const current = {
    emailHash: hashEmail(input.email),
    providerSlug: input.providerSlug,
    planSlug: input.planSlug ?? "*",
  };

  if (!isDatabaseConfigured()) {
    const attempts = (memoryAttempts.get(ipHash) ?? []).filter(
      (attempt) =>
        attempt.createdAt.getTime() > now.getTime() - IP_DAILY_WINDOW_MS,
    );
    const result = evaluateAttempt(attempts, current, now);
    if (result.allowed || result.reason !== "ip_daily") {
      attempts.push({ ...current, accepted: result.allowed, createdAt: now });
    }
    memoryAttempts.set(ipHash, attempts);
    return result;
  }

  return getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${ipHash}, 0))`,
    );
    const cutoff = new Date(now.getTime() - IP_DAILY_WINDOW_MS);
    await tx
      .delete(subscriptionAttempts)
      .where(lte(subscriptionAttempts.createdAt, cutoff));
    const attempts = await tx
      .select({
        emailHash: subscriptionAttempts.emailHash,
        providerSlug: subscriptionAttempts.providerSlug,
        planSlug: subscriptionAttempts.planSlug,
        accepted: subscriptionAttempts.accepted,
        createdAt: subscriptionAttempts.createdAt,
      })
      .from(subscriptionAttempts)
      .where(
        and(
          eq(subscriptionAttempts.ipHash, ipHash),
          gt(subscriptionAttempts.createdAt, cutoff),
        ),
      )
      .orderBy(desc(subscriptionAttempts.createdAt));

    const result = evaluateAttempt(attempts, current, now);
    if (result.allowed || result.reason !== "ip_daily") {
      await tx.insert(subscriptionAttempts).values({
        ipHash,
        ...current,
        accepted: result.allowed,
        createdAt: now,
      });
    }
    return result;
  });
}

export function clearSubscriptionRateLimitsForTests(): void {
  memoryAttempts.clear();
}
