import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  isSameOriginRequest,
} from "@/lib/admin/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/admin/login", request.url), {
    status: 303,
  });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", adminCookieOptions(0));
  return response;
}
