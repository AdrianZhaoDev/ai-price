import { confirmSubscription } from "@/lib/subscriptions/repository";
import { createSubscriptionUrl } from "@/lib/subscriptions/urls";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(
      createSubscriptionUrl("/subscription/result?status=invalid", request.url),
    );
  }

  const confirmed = await confirmSubscription(token);
  return NextResponse.redirect(
    createSubscriptionUrl(
      `/subscription/result?status=${confirmed ? "confirmed" : "invalid"}`,
      request.url,
    ),
  );
}
