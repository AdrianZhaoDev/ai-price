import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { emailTokenSecret } from "@/lib/subscriptions/repository";

export const ADMIN_SESSION_COOKIE = "ai_price_admin_session";
export const ADMIN_CHALLENGE_COOKIE = "ai_price_admin_challenge";
export const ADMIN_CODE_TTL_SECONDS = 10 * 60;
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

type SignedPayload = {
  kind: "challenge" | "session";
  expiresAt: number;
  challengeId?: string;
};

type ChallengeState = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
};

const globalChallenges = globalThis as typeof globalThis & {
  __aiPriceAdminChallenges?: Map<string, ChallengeState>;
};
const challenges =
  globalChallenges.__aiPriceAdminChallenges ??
  (globalChallenges.__aiPriceAdminChallenges = new Map());

function signature(value: string): string {
  return createHmac("sha256", emailTokenSecret())
    .update(value)
    .digest("base64url");
}

function sign(payload: SignedPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

function readSigned(value: string | undefined): SignedPayload | null {
  if (!value) return null;
  const [encoded, receivedSignature, extra] = value.split(".");
  if (!encoded || !receivedSignature || extra) return null;
  const expectedSignature = signature(encoded);
  const actual = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SignedPayload;
    if (
      (payload.kind !== "challenge" && payload.kind !== "session") ||
      !Number.isFinite(payload.expiresAt)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function codeHash(code: string): string {
  return createHmac("sha256", emailTokenSecret()).update(code).digest("hex");
}

export function createAdminLoginCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

export function createAdminChallenge(code: string, now = Date.now()): string {
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(id);
  }
  const challengeId = crypto.randomUUID();
  const expiresAt = now + ADMIN_CODE_TTL_SECONDS * 1000;
  challenges.set(challengeId, {
    codeHash: codeHash(code),
    expiresAt,
    attempts: 0,
  });
  return sign({
    kind: "challenge",
    expiresAt,
    challengeId,
  });
}

export function verifyAdminChallenge(
  code: string,
  challenge: string | undefined,
  now = Date.now(),
): boolean {
  const payload = readSigned(challenge);
  if (
    !payload ||
    payload.kind !== "challenge" ||
    !payload.challengeId ||
    payload.expiresAt <= now
  ) {
    return false;
  }
  const state = challenges.get(payload.challengeId);
  if (!state || state.expiresAt <= now || state.attempts >= 5) {
    challenges.delete(payload.challengeId);
    return false;
  }
  state.attempts += 1;
  const actual = Buffer.from(codeHash(code), "hex");
  const expected = Buffer.from(state.codeHash, "hex");
  const valid =
    actual.length === expected.length && timingSafeEqual(actual, expected);
  if (valid || state.attempts >= 5) challenges.delete(payload.challengeId);
  return valid;
}

export function createAdminSession(now = Date.now()): string {
  return sign({
    kind: "session",
    expiresAt: now + ADMIN_SESSION_TTL_SECONDS * 1000,
  });
}

export function isAdminSession(
  session: string | undefined,
  now = Date.now(),
): boolean {
  const payload = readSigned(session);
  return Boolean(
    payload && payload.kind === "session" && payload.expiresAt > now,
  );
}

export function adminCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.APP_URL?.startsWith("https://") ?? false,
    path: "/",
    maxAge,
  };
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}
