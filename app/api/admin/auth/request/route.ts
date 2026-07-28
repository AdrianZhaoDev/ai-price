import {
  ADMIN_CHALLENGE_COOKIE,
  ADMIN_CODE_TTL_SECONDS,
  adminCookieOptions,
  createAdminChallenge,
  createAdminLoginCode,
  isSameOriginRequest,
} from "@/lib/admin/auth";
import { sendAdminLoginCode } from "@/lib/admin/mailer";
import { NextResponse } from "next/server";

const globalRateLimits = globalThis as typeof globalThis & {
  __aiPriceAdminLoginRateLimits?: Map<
    string,
    { count: number; resetAt: number }
  >;
};
const rateLimits =
  globalRateLimits.__aiPriceAdminLoginRateLimits ??
  (globalRateLimits.__aiPriceAdminLoginRateLimits = new Map());

function clientKey(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    "unknown"
  );
}

function isRateLimited(request: Request): boolean {
  const now = Date.now();
  for (const [key, value] of rateLimits) {
    if (value.resetAt <= now) rateLimits.delete(key);
  }
  const limits = [
    { key: `ip:${clientKey(request)}`, maximum: 3 },
    { key: "global", maximum: 10 },
  ];
  let limited = false;
  for (const limit of limits) {
    const current = rateLimits.get(limit.key);
    if (!current) {
      rateLimits.set(limit.key, {
        count: 1,
        resetAt: now + 10 * 60 * 1000,
      });
      continue;
    }
    current.count += 1;
    if (current.count > limit.maximum) limited = true;
  }
  return limited;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  }
  if (isRateLimited(request)) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试。" },
      { status: 429 },
    );
  }

  const code = createAdminLoginCode();
  try {
    await sendAdminLoginCode(code);
  } catch {
    return NextResponse.json(
      { error: "验证码发送失败，请检查 SMTP 配置。" },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_CHALLENGE_COOKIE,
    createAdminChallenge(code),
    adminCookieOptions(ADMIN_CODE_TTL_SECONDS),
  );
  return response;
}
