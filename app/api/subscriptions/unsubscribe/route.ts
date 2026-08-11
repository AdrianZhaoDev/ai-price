import { unsubscribe } from "@/lib/subscriptions/repository";
import { createSubscriptionUrl } from "@/lib/subscriptions/urls";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const resultPath =
    request.nextUrl.searchParams.get("locale") === "en"
      ? "/en/subscription/result"
      : "/subscription/result";
  if (!token) {
    return NextResponse.redirect(
      createSubscriptionUrl(`${resultPath}?status=invalid`, request.url),
    );
  }

  const removed = await unsubscribe(token);
  return NextResponse.redirect(
    createSubscriptionUrl(
      `${resultPath}?status=${removed ? "unsubscribed" : "invalid"}`,
      request.url,
    ),
  );
}
