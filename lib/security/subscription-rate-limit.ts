import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { subscriptionAttempts } from "@/lib/db/schema";
import { hashEmail, hashValue } from "@/lib/security/tokens";
import {
  API_MODEL_NEW_PROVIDER_SLUG,
  isApiModelNewScope,
} from "@/lib/subscriptions/scopes";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";

const SAME_SCOPE_DIFFERENT_EMAIL_MS = 20 * 1000;
const DIFFERENT_SCOPE_DIFFERENT_EMAIL_MS = 300 * 1000;
const DIFFERENT_SCOPE_SAME_EMAIL_MS = 10 * 1000;
const IP_WINDOW_MS = 5 * 60 * 60 * 1000;
const IP_WINDOW_LIMIT = 10;

export type SubscriptionRateLimitReason =
  | "same_scope_different_email"
  | "different_scope_different_email"
  | "different_scope_same_email"
  | "ip_window";

export type SubscriptionRateLimitResult =
  | { allowed: true; retryAfterSeconds: 0; fallbackAttemptId?: string }
  | {
      allowed: false;
      reason: SubscriptionRateLimitReason;
      retryAfterSeconds: number;
      rankingFallbackAllowed?: boolean;
    };

type SubscriptionRateLimitInput = {
  ipAddress: string;
  email: string;
  providerSlug: string;
  planSlug: string | null;
  rankingFallback?: boolean;
  now?: Date;
};

type Attempt = {
  id: string;
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
  current: Omit<Attempt, "id" | "accepted" | "createdAt">,
  now: Date,
  rankingFallback: boolean,
): SubscriptionRateLimitResult {
  const nowMs = now.getTime();
  const withinWindow = attempts.filter(
    (attempt) => attempt.createdAt.getTime() > nowMs - IP_WINDOW_MS,
  );

  if (withinWindow.length >= IP_WINDOW_LIMIT) {
    const rankingFallbackUsed = withinWindow.some(
      (attempt) =>
        attempt.accepted &&
        attempt.providerSlug === API_MODEL_NEW_PROVIDER_SLUG,
    );
    const rankingFallbackAllowed = !rankingFallbackUsed;
    if (
      rankingFallback &&
      rankingFallbackAllowed &&
      isApiModelNewScope(current.providerSlug, current.planSlug)
    ) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const oldest = withinWindow.reduce((earliest, attempt) =>
      attempt.createdAt < earliest.createdAt ? attempt : earliest,
    );
    return {
      allowed: false,
      reason: "ip_window",
      retryAfterSeconds: secondsRemaining(
        oldest.createdAt.getTime() + IP_WINDOW_MS,
        nowMs,
      ),
      rankingFallbackAllowed,
    };
  }

  const previousAcceptedAttempt = withinWindow
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
  let reason: Exclude<SubscriptionRateLimitReason, "ip_window"> | undefined;
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
      (attempt) => attempt.createdAt.getTime() > now.getTime() - IP_WINDOW_MS,
    );
    const result = evaluateAttempt(
      attempts,
      current,
      now,
      input.rankingFallback === true,
    );
    if (result.allowed || result.reason !== "ip_window") {
      const id = crypto.randomUUID();
      attempts.push({
        id,
        ...current,
        accepted: result.allowed,
        createdAt: now,
      });
      memoryAttempts.set(ipHash, attempts);
      if (result.allowed && input.rankingFallback === true) {
        return { ...result, fallbackAttemptId: id };
      }
    }
    memoryAttempts.set(ipHash, attempts);
    return result;
  }

  return getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${ipHash}, 0))`,
    );
    const cutoff = new Date(now.getTime() - IP_WINDOW_MS);
    await tx
      .delete(subscriptionAttempts)
      .where(lte(subscriptionAttempts.createdAt, cutoff));
    const attempts = await tx
      .select({
        id: subscriptionAttempts.id,
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

    const result = evaluateAttempt(
      attempts,
      current,
      now,
      input.rankingFallback === true,
    );
    if (result.allowed || result.reason !== "ip_window") {
      const [inserted] = await tx
        .insert(subscriptionAttempts)
        .values({
          ipHash,
          ...current,
          accepted: result.allowed,
          createdAt: now,
        })
        .returning({ id: subscriptionAttempts.id });
      if (result.allowed && input.rankingFallback === true) {
        return { ...result, fallbackAttemptId: inserted.id };
      }
    }
    return result;
  });
}

export async function releaseRankingFallbackAttempt(
  attemptId: string,
): Promise<void> {
  if (!isDatabaseConfigured()) {
    for (const [ipHash, attempts] of memoryAttempts) {
      const retained = attempts.filter((attempt) => attempt.id !== attemptId);
      if (retained.length !== attempts.length) {
        memoryAttempts.set(ipHash, retained);
        return;
      }
    }
    return;
  }
  await getDatabase()
    .delete(subscriptionAttempts)
    .where(eq(subscriptionAttempts.id, attemptId));
}

export function clearSubscriptionRateLimitsForTests(): void {
  memoryAttempts.clear();
}
