import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import {
  transitSubmissionAttempts,
  transitSubmissions,
  transitSubmissionVerifications,
} from "@/lib/db/schema";
import { verifyTokenHash } from "@/lib/security/tokens";

export async function createTransitVerificationRecord(input: {
  id: string;
  emailHash: string;
  codeHash: string;
  expiresAt: Date;
  createdAt: Date;
}): Promise<void> {
  const database = getDatabase();
  await database
    .delete(transitSubmissionVerifications)
    .where(lte(transitSubmissionVerifications.expiresAt, input.createdAt));
  await database.insert(transitSubmissionVerifications).values(input);
}

export async function deleteTransitVerificationRecord(
  id: string,
): Promise<void> {
  await getDatabase()
    .delete(transitSubmissionVerifications)
    .where(eq(transitSubmissionVerifications.id, id));
}

export async function confirmTransitVerificationRecord(input: {
  id: string;
  emailHash: string;
  code: string;
  secret: string;
  now: Date;
  maxAttempts: number;
}): Promise<boolean> {
  return getDatabase().transaction(async (tx) => {
    const [verification] = await tx
      .select()
      .from(transitSubmissionVerifications)
      .where(eq(transitSubmissionVerifications.id, input.id))
      .limit(1)
      .for("update");
    if (
      !verification ||
      verification.emailHash !== input.emailHash ||
      verification.expiresAt <= input.now ||
      verification.consumedAt ||
      verification.attempts >= input.maxAttempts
    ) {
      return false;
    }
    const attempts = verification.attempts + 1;
    const valid = verifyTokenHash(
      `${input.id}:${input.code}`,
      verification.codeHash,
      input.secret,
    );
    await tx
      .update(transitSubmissionVerifications)
      .set({ attempts, ...(valid ? { verifiedAt: input.now } : {}) })
      .where(eq(transitSubmissionVerifications.id, input.id));
    return valid;
  });
}

export type TransitSubmissionRecordResult =
  "submitted" | "duplicate" | "rate_limited" | "verification_required";

export async function createTransitSubmissionRecord(input: {
  verificationId: string;
  emailHash: string;
  websiteUrl: string;
  websiteKey: string;
  description: string;
  ipHash: string;
  now: Date;
  cutoff: Date;
  windowLimit: number;
}): Promise<TransitSubmissionRecordResult> {
  return getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`transit-site:${input.websiteKey}`}, 0))`,
    );
    const [existing] = await tx
      .select({ id: transitSubmissions.id })
      .from(transitSubmissions)
      .where(eq(transitSubmissions.websiteKey, input.websiteKey))
      .limit(1);
    if (existing) return "duplicate";

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`transit-ip:${input.ipHash}`}, 0))`,
    );
    await tx
      .delete(transitSubmissionAttempts)
      .where(
        and(
          eq(transitSubmissionAttempts.ipHash, input.ipHash),
          lte(transitSubmissionAttempts.createdAt, input.cutoff),
        ),
      );
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(transitSubmissionAttempts)
      .where(
        and(
          eq(transitSubmissionAttempts.ipHash, input.ipHash),
          gt(transitSubmissionAttempts.createdAt, input.cutoff),
        ),
      );
    if (count >= input.windowLimit) return "rate_limited";
    await tx
      .insert(transitSubmissionAttempts)
      .values({ ipHash: input.ipHash, createdAt: input.now });

    const [verification] = await tx
      .select({ id: transitSubmissionVerifications.id })
      .from(transitSubmissionVerifications)
      .where(
        and(
          eq(transitSubmissionVerifications.id, input.verificationId),
          eq(transitSubmissionVerifications.emailHash, input.emailHash),
          gt(transitSubmissionVerifications.expiresAt, input.now),
          isNotNull(transitSubmissionVerifications.verifiedAt),
          isNull(transitSubmissionVerifications.consumedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!verification) return "verification_required";

    await tx.insert(transitSubmissions).values({
      websiteUrl: input.websiteUrl,
      websiteKey: input.websiteKey,
      description: input.description,
      submitterEmailHash: input.emailHash,
      createdAt: input.now,
    });
    await tx
      .update(transitSubmissionVerifications)
      .set({ consumedAt: input.now })
      .where(eq(transitSubmissionVerifications.id, verification.id));
    return "submitted";
  });
}
