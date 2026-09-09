import { randomInt } from "node:crypto";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  confirmTransitVerificationRecord,
  createTransitSubmissionRecord,
  createTransitVerificationRecord,
  deleteTransitVerificationRecord,
  type TransitSubmissionRecordResult,
} from "@/lib/db/transit-submissions";
import { emailTokenSecret } from "@/lib/subscriptions/repository";
import {
  hashEmail,
  hashToken,
  hashValue,
  verifyTokenHash,
} from "@/lib/security/tokens";

export const TRANSIT_VERIFICATION_TTL_MS = 10 * 60 * 1000;
export const TRANSIT_VERIFICATION_MAX_ATTEMPTS = 5;
export const TRANSIT_SUBMISSION_WINDOW_MS = 5 * 60 * 1000;
export const TRANSIT_SUBMISSION_WINDOW_LIMIT = 5;

type MemoryVerification = {
  emailHash: string;
  codeHash: string;
  attempts: number;
  expiresAt: number;
  verifiedAt: number | null;
  consumedAt: number | null;
};

const memoryState = globalThis as typeof globalThis & {
  __aiPriceTransitSubmissionVerifications?: Map<string, MemoryVerification>;
  __aiPriceTransitSubmissions?: Set<string>;
  __aiPriceTransitSubmissionAttempts?: Map<string, number[]>;
};

const memoryVerifications =
  memoryState.__aiPriceTransitSubmissionVerifications ??
  (memoryState.__aiPriceTransitSubmissionVerifications = new Map<
    string,
    MemoryVerification
  >());
const memorySubmissions =
  memoryState.__aiPriceTransitSubmissions ??
  (memoryState.__aiPriceTransitSubmissions = new Set<string>());
const memoryAttempts =
  memoryState.__aiPriceTransitSubmissionAttempts ??
  (memoryState.__aiPriceTransitSubmissionAttempts = new Map<
    string,
    number[]
  >());

export function createTransitSubmissionCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

function verificationCodeHash(id: string, code: string): string {
  return hashToken(`${id}:${code}`, emailTokenSecret());
}

export function transitWebsiteKey(url: string): string {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  return `${hostname}${parsed.port ? `:${parsed.port}` : ""}`;
}

export async function createTransitSubmissionVerification(input: {
  email: string;
  code: string;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const id = crypto.randomUUID();
  const verification = {
    id,
    emailHash: hashEmail(input.email),
    codeHash: verificationCodeHash(id, input.code),
    expiresAt: new Date(now.getTime() + TRANSIT_VERIFICATION_TTL_MS),
    createdAt: now,
  };

  if (isDatabaseConfigured()) {
    await createTransitVerificationRecord(verification);
    return id;
  }

  for (const [key, value] of memoryVerifications) {
    if (value.expiresAt <= now.getTime()) memoryVerifications.delete(key);
  }
  memoryVerifications.set(id, {
    emailHash: verification.emailHash,
    codeHash: verification.codeHash,
    attempts: 0,
    expiresAt: verification.expiresAt.getTime(),
    verifiedAt: null,
    consumedAt: null,
  });
  return id;
}

export async function deleteTransitSubmissionVerification(
  id: string,
): Promise<void> {
  if (isDatabaseConfigured()) {
    await deleteTransitVerificationRecord(id);
    return;
  }
  memoryVerifications.delete(id);
}

export async function confirmTransitSubmissionVerification(input: {
  id: string;
  email: string;
  code: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const emailHash = hashEmail(input.email);
  if (isDatabaseConfigured()) {
    return confirmTransitVerificationRecord({
      id: input.id,
      emailHash,
      code: input.code,
      secret: emailTokenSecret(),
      now,
      maxAttempts: TRANSIT_VERIFICATION_MAX_ATTEMPTS,
    });
  }

  const verification = memoryVerifications.get(input.id);
  if (
    !verification ||
    verification.emailHash !== emailHash ||
    verification.expiresAt <= now.getTime() ||
    verification.consumedAt !== null ||
    verification.attempts >= TRANSIT_VERIFICATION_MAX_ATTEMPTS
  ) {
    return false;
  }
  verification.attempts += 1;
  const valid = verifyTokenHash(
    `${input.id}:${input.code}`,
    verification.codeHash,
    emailTokenSecret(),
  );
  if (valid) verification.verifiedAt = now.getTime();
  return valid;
}

export type TransitSubmissionResult = TransitSubmissionRecordResult;

export async function createTransitSubmission(input: {
  verificationId: string;
  email: string;
  websiteUrl: string;
  description: string;
  ipAddress: string;
  now?: Date;
}): Promise<TransitSubmissionResult> {
  const now = input.now ?? new Date();
  const websiteKey = transitWebsiteKey(input.websiteUrl);
  const emailHash = hashEmail(input.email);
  const ipHash = hashValue(input.ipAddress.trim() || "unknown");
  const cutoff = new Date(now.getTime() - TRANSIT_SUBMISSION_WINDOW_MS);

  if (isDatabaseConfigured()) {
    return createTransitSubmissionRecord({
      verificationId: input.verificationId,
      emailHash,
      websiteUrl: input.websiteUrl,
      websiteKey,
      description: input.description,
      ipHash,
      now,
      cutoff,
      windowLimit: TRANSIT_SUBMISSION_WINDOW_LIMIT,
    });
  }

  if (memorySubmissions.has(websiteKey)) return "duplicate";
  const attempts = (memoryAttempts.get(ipHash) ?? []).filter(
    (createdAt) => createdAt > cutoff.getTime(),
  );
  if (attempts.length >= TRANSIT_SUBMISSION_WINDOW_LIMIT) {
    memoryAttempts.set(ipHash, attempts);
    return "rate_limited";
  }
  attempts.push(now.getTime());
  memoryAttempts.set(ipHash, attempts);
  const verification = memoryVerifications.get(input.verificationId);
  if (
    !verification ||
    verification.emailHash !== emailHash ||
    verification.expiresAt <= now.getTime() ||
    verification.verifiedAt === null ||
    verification.consumedAt !== null
  ) {
    return "verification_required";
  }
  verification.consumedAt = now.getTime();
  memorySubmissions.add(websiteKey);
  return "submitted";
}

export function clearTransitSubmissionsForTests(): void {
  memoryVerifications.clear();
  memorySubmissions.clear();
  memoryAttempts.clear();
}
