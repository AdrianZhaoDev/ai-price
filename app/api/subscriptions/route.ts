import { providerCatalog } from "@/lib/data/catalog";
import { hashEmail } from "@/lib/security/tokens";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requestPriceSubscription } from "@/lib/subscriptions/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  email: z.email("请输入有效邮箱。").max(254),
  providerId: z.string().min(1).max(80),
  planId: z.string().min(1).max(120).nullable().optional(),
  website: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const rateLimit = checkRateLimit(`subscribe:${ip}`, 5, 10 * 60 * 1000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "请求过于频繁，请稍后再试。" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

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

  if (parsed.data.website) {
    return NextResponse.json({
      message: "确认邮件已经发送，请检查收件箱。",
    });
  }

  const emailRateLimit = checkRateLimit(
    `subscribe:email:${hashEmail(parsed.data.email)}`,
    3,
    60 * 60 * 1000,
  );
  if (!emailRateLimit.allowed) {
    return NextResponse.json(
      { message: "该邮箱的确认邮件发送过于频繁，请稍后再试。" },
      {
        status: 429,
        headers: {
          "Retry-After": String(emailRateLimit.retryAfterSeconds),
        },
      },
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
    const result = await requestPriceSubscription({
      email: parsed.data.email,
      providerId: parsed.data.providerId,
      planId: parsed.data.planId ?? null,
    });

    return NextResponse.json({
      message: "确认邮件已经发送，请检查收件箱。",
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error && process.env.NODE_ENV !== "production"
        ? error.message
        : "暂时无法创建订阅，请稍后重试。";
    return NextResponse.json({ message }, { status: 503 });
  }
}
