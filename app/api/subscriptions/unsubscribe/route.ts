import { unsubscribe } from "@/lib/subscriptions/repository";
import { createSubscriptionUrl } from "@/lib/subscriptions/urls";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const locale =
    request.nextUrl.searchParams.get("locale") === "en" ? "en" : "zh-CN";
  const resultPath =
    locale === "en" ? "/en/subscription/result" : "/subscription/result";
  const resultUrl = (status: "invalid" | "unsubscribed") => {
    const url = createSubscriptionUrl(resultPath, request.url);
    url.searchParams.set("status", status);
    url.searchParams.set("locale", locale);
    return url;
  };
  if (!token) {
    return NextResponse.redirect(resultUrl("invalid"));
  }

  const removed = await unsubscribe(token);
  return NextResponse.redirect(resultUrl(removed ? "unsubscribed" : "invalid"));
}
