import { unsubscribe } from "@/lib/subscriptions/repository";
import { createSubscriptionUrl } from "@/lib/subscriptions/urls";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(
      createSubscriptionUrl("/subscription/result?status=invalid", request.url),
    );
  }

  const removed = await unsubscribe(token);
  return NextResponse.redirect(
    createSubscriptionUrl(
      `/subscription/result?status=${removed ? "unsubscribed" : "invalid"}`,
      request.url,
    ),
  );
}
