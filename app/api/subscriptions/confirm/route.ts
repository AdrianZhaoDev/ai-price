import { confirmSubscription } from "@/lib/subscriptions/repository";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(
      new URL("/subscription/result?status=invalid", request.url),
    );
  }

  const confirmed = await confirmSubscription(token);
  return NextResponse.redirect(
    new URL(
      `/subscription/result?status=${confirmed ? "confirmed" : "invalid"}`,
      request.url,
    ),
  );
}
