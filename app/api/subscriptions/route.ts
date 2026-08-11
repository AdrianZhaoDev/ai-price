import { providerCatalog } from "@/lib/data/catalog";
import {
  checkSubscriptionRateLimit,
  releaseRankingFallbackAttempt,
  type SubscriptionRateLimitResult,
} from "@/lib/security/subscription-rate-limit";
import {
  requestApiModelNewSubscription,
  requestPriceSubscription,
  sendSubscriptionCreatedEmail,
} from "@/lib/subscriptions/service";
import {
  API_MODEL_NEW_PLAN_SLUG,
  API_MODEL_NEW_PROVIDER_SLUG,
} from "@/lib/subscriptions/scopes";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMessages, isLocale, type Locale } from "@/lib/i18n";

const emailSchema = z.email("请输入有效邮箱。").max(254);
const priceRequestSchema = z.object({
  subscriptionType: z.literal("price").optional().default("price"),
  email: emailSchema,
  providerId: z.string().min(1).max(80),
  planId: z.string().min(1).max(120).nullable().optional(),
  locale: z.enum(["zh-CN", "en"]).optional().default("zh-CN"),
});
const modelRequestSchema = z.object({
  subscriptionType: z.enum(["api_model_new", "api_ranking"]),
  email: emailSchema,
  rankingFallback: z.boolean().optional().default(false),
  locale: z.enum(["zh-CN", "en"]).optional().default("zh-CN"),
});
const requestSchema = z.union([modelRequestSchema, priceRequestSchema]);

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
  locale: Locale,
): string {
  const messages = getMessages(locale).subscription;
  switch (rateLimit.reason) {
    case "same_scope_different_email":
      return locale === "en"
        ? messages.rateLimitSameScopeDifferentEmail(rateLimit.retryAfterSeconds)
        : `同一关注使用不同邮箱时需间隔 20 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "different_scope_different_email":
      return locale === "en"
        ? messages.rateLimitDifferentScopeDifferentEmail(
            rateLimit.retryAfterSeconds,
          )
        : `同时更换关注和邮箱时需间隔 300 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "different_scope_same_email":
      return locale === "en"
        ? messages.rateLimitDifferentScopeSameEmail(rateLimit.retryAfterSeconds)
        : `同一邮箱更换关注时需间隔 10 秒，请在 ${rateLimit.retryAfterSeconds} 秒后再试。`;
    case "ip_window":
      return rateLimit.rankingFallbackAllowed
        ? messages.rateLimitFallback
        : messages.rateLimitTooMany;
  }
}

function localeFromBody(body: unknown): Locale {
  if (typeof body === "object" && body !== null && "locale" in body) {
    const locale = (body as { locale?: unknown }).locale;
    if (typeof locale === "string" && isLocale(locale)) return locale;
  }
  return "zh-CN";
}

export async function POST(request: NextRequest) {
  let fallbackAttemptId: string | undefined;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: getMessages("zh-CN").subscription.invalidRequest },
      { status: 400 },
    );
  }

  const requestedLocale = localeFromBody(body);
  const messages = getMessages(requestedLocale).subscription;
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          parsed.error.issues[0]?.code === "invalid_format"
            ? messages.emailInvalid
            : messages.invalidRequest,
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const modelRequest = data.subscriptionType !== "price";
  const provider =
    data.subscriptionType === "price"
      ? providerCatalog.find((candidate) => candidate.id === data.providerId)
      : undefined;
  const scopeProviderSlug = modelRequest
    ? API_MODEL_NEW_PROVIDER_SLUG
    : data.providerId;
  const scopePlanSlug = modelRequest
    ? API_MODEL_NEW_PLAN_SLUG
    : (data.planId ?? null);
  if (!modelRequest && !provider) {
    return NextResponse.json(
      { message: messages.productNotFound },
      { status: 404 },
    );
  }

  try {
    const rateLimit = await checkSubscriptionRateLimit({
      ipAddress: clientIp(request),
      email: data.email,
      providerSlug: scopeProviderSlug,
      planSlug: scopePlanSlug,
      rankingFallback: modelRequest && data.rankingFallback,
    });
    if (!rateLimit.allowed) {
      const isWindowLimit = rateLimit.reason === "ip_window";
      return NextResponse.json(
        {
          message: rateLimitMessage(rateLimit, data.locale),
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

    const result = modelRequest
      ? await requestApiModelNewSubscription(data.email, data.locale)
      : await requestPriceSubscription({
          email: data.email,
          providerId: data.providerId,
          planId: data.planId ?? null,
          locale: data.locale,
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
      message: messages.success,
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
        : messages.createError;
    return NextResponse.json({ message }, { status: 503 });
  }
}
