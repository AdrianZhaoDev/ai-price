import { providerCatalog } from "@/lib/data/catalog";
import {
  checkSubscriptionRateLimit,
  releaseRankingFallbackAttempt,
  type SubscriptionRateLimitResult,
} from "@/lib/security/subscription-rate-limit";
import {
  requestApiRankingSubscription,
  requestPriceSubscription,
  sendSubscriptionCreatedEmail,
} from "@/lib/subscriptions/service";
import {
  API_RANKING_PLAN_SLUG,
  API_RANKING_PROVIDER_SLUG,
} from "@/lib/subscriptions/scopes";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const emailSchema = z.email("请输入有效邮箱。").max(254);
const priceRequestSchema = z.object({
  subscriptionType: z.literal("price").optional().default("price"),
  email: emailSchema,
  providerId: z.string().min(1).max(80),
  planId: z.string().min(1).max(120).nullable().optional(),
});
const rankingRequestSchema = z.object({
  subscriptionType: z.literal("api_ranking"),
  email: emailSchema,
  rankingFallback: z.boolean().optional().default(false),
});
const requestSchema = z.union([rankingRequestSchema, priceRequestSchema]);

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
      return `同一关注使用不同邮箱时需间隔 20 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "different_scope_different_email":
      return `同时更换关注和邮箱时需间隔 300 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "different_scope_same_email":
      return `同一邮箱更换关注时需间隔 10 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "ip_window":
      return rateLimit.rankingFallbackAllowed
        ? "您近期提交了较多订阅。要不要改为一次订阅 API 价格排行榜？之后缓存输入、非缓存输入和输出价格有变化时，我们都会通知您。"
        : "您近期提交的订阅较多，请过段时间再试。";
  }
}

export async function POST(request: NextRequest) {
  let fallbackAttemptId: string | undefined;
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

  const data = parsed.data;
  const rankingRequest = data.subscriptionType === "api_ranking";
  const provider =
    data.subscriptionType === "price"
      ? providerCatalog.find((candidate) => candidate.id === data.providerId)
      : undefined;
  const scopeProviderSlug =
    data.subscriptionType === "api_ranking"
      ? API_RANKING_PROVIDER_SLUG
      : data.providerId;
  const scopePlanSlug =
    data.subscriptionType === "api_ranking"
      ? API_RANKING_PLAN_SLUG
      : (data.planId ?? null);
  if (!rankingRequest && !provider) {
    return NextResponse.json(
      { message: "未找到要关注的产品。" },
      { status: 404 },
    );
  }

  try {
    const rateLimit = await checkSubscriptionRateLimit({
      ipAddress: clientIp(request),
      email: data.email,
      providerSlug: scopeProviderSlug,
      planSlug: scopePlanSlug,
      rankingFallback:
        data.subscriptionType === "api_ranking" && data.rankingFallback,
    });
    if (!rateLimit.allowed) {
      const isWindowLimit = rateLimit.reason === "ip_window";
      return NextResponse.json(
        {
          message: rateLimitMessage(rateLimit),
          ...(isWindowLimit
            ? {
                code: "subscription_limit",
                retryAfterSeconds: rateLimit.retryAfterSeconds,
                rankingFallbackAllowed:
                  rateLimit.rankingFallbackAllowed === true,
              }
            : {}),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }
    fallbackAttemptId = rateLimit.fallbackAttemptId;

    const result =
      data.subscriptionType === "api_ranking"
        ? await requestApiRankingSubscription(data.email)
        : await requestPriceSubscription({
            email: data.email,
            providerId: data.providerId,
            planId: data.planId ?? null,
          });

    const notificationId = result.notificationId;
    if (notificationId) {
      after(async () => {
        try {
          await sendSubscriptionCreatedEmail(notificationId);
        } catch (error) {
          console.error("Subscription email delivery failed.", {
            subscriptionId: notificationId,
            providerId: scopeProviderSlug,
            planId: scopePlanSlug,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });
    }

    return NextResponse.json({
      status: "subscribed",
      message: "您已订阅成功！",
    });
  } catch (error) {
    if (fallbackAttemptId) {
      await releaseRankingFallbackAttempt(fallbackAttemptId).catch(
        (releaseError) =>
          console.error("Failed to release ranking fallback attempt.", {
            error:
              releaseError instanceof Error
                ? releaseError.message
                : "Unknown error",
          }),
      );
    }
    console.error("Subscription request failed.", {
      providerId: scopeProviderSlug,
      planId: scopePlanSlug,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    const message =
      error instanceof Error && process.env.NODE_ENV !== "production"
        ? error.message
        : "暂时无法创建订阅，请稍后重试。";
    return NextResponse.json({ message }, { status: 503 });
  }
}
