import {
  ADMIN_CHALLENGE_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  adminCookieOptions,
  createAdminSession,
  isSameOriginRequest,
  verifyAdminChallenge,
} from "@/lib/admin/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const inputSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入 6 位验证码。" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const challenge = cookieStore.get(ADMIN_CHALLENGE_COOKIE)?.value;
  if (!verifyAdminChallenge(parsed.data.code, challenge)) {
    return NextResponse.json(
      { error: "验证码错误或已过期。" },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    createAdminSession(),
    adminCookieOptions(ADMIN_SESSION_TTL_SECONDS),
  );
  response.cookies.set(ADMIN_CHALLENGE_COOKIE, "", adminCookieOptions(0));
  return response;
}
