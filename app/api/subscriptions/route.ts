import { providerCatalog } from "@/lib/data/catalog";
import {
  checkSubscriptionRateLimit,
  type SubscriptionRateLimitResult,
} from "@/lib/security/subscription-rate-limit";
import {
  requestPriceSubscription,
  sendSubscriptionCreatedEmail,
} from "@/lib/subscriptions/service";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  email: z.email("请输入有效邮箱。").max(254),
  providerId: z.string().min(1).max(80),
  planId: z.string().min(1).max(120).nullable().optional(),
});

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimitMessage(
  rateLimit: Exclude<SubscriptionRateLimitResult, { allowed: true }>,
): string {
  switch (rateLimit.reason) {
    case "same_scope_different_email":
      return `同一关注使用不同邮箱时需间隔 60 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "different_scope_different_email":
      return `同时更换关注和邮箱时需间隔 120 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "different_scope_same_email":
      return `同一邮箱更换关注时需间隔 10 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "ip_daily":
      return "同一 IP 24 小时内最多提交 10 次订阅，请稍后再试。";
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "请求格式无效。" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "请求内容无效。" },
      { status: 400 },
    );
  }

  const provider = providerCatalog.find(
    (candidate) => candidate.id === parsed.data.providerId,
  );
  if (!provider) {
    return NextResponse.json(
      { message: "未找到要关注的产品。" },
      { status: 404 },
    );
  }

  try {
    const rateLimit = await checkSubscriptionRateLimit({
      ipAddress: clientIp(request),
      email: parsed.data.email,
      providerSlug: parsed.data.providerId,
      planSlug: parsed.data.planId ?? null,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: rateLimitMessage(rateLimit) },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const result = await requestPriceSubscription({
      email: parsed.data.email,
      providerId: parsed.data.providerId,
      planId: parsed.data.planId ?? null,
    });
    if (result.status === "already_subscribed") {
      return NextResponse.json({
        status: result.status,
        message: "您已订阅，请勿重复订阅。",
      });
    }

    after(async () => {
      try {
        await sendSubscriptionCreatedEmail(result.emailTask);
      } catch (error) {
        console.error("Subscription email delivery failed.", {
          subscriptionId: result.emailTask.subscriptionId,
          providerId: parsed.data.providerId,
          planId: parsed.data.planId ?? null,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    return NextResponse.json({
      status: result.status,
      message: "您已订阅成功！",
    });
  } catch (error) {
    console.error("Subscription request failed.", {
      providerId: parsed.data.providerId,
      planId: parsed.data.planId ?? null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    const message =
      error instanceof Error && process.env.NODE_ENV !== "production"
        ? error.message
        : "暂时无法创建订阅，请稍后重试。";
    return NextResponse.json({ message }, { status: 503 });
  }
}
