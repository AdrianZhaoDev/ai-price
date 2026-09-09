import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  reserveEmailDelivery,
  settleEmailDelivery,
} from "@/lib/email/delivery";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hashEmail, hashValue } from "@/lib/security/tokens";
import {
  isAllowedTransitSubmissionOrigin,
  readTransitSubmissionJson,
  transitSubmissionClientIp,
} from "@/lib/transit/submission-http";
import {
  confirmTransitSubmissionVerification,
  createTransitSubmissionCode,
  createTransitSubmissionVerification,
  deleteTransitSubmissionVerification,
} from "@/lib/transit/submissions";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const requestSchema = z
  .object({
    email: emailSchema,
    locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
  })
  .strict();
const confirmSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    email: emailSchema,
    verificationId: z.uuid(),
  })
  .strict();

function reply(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { code, ...extra },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!isAllowedTransitSubmissionOrigin(request)) {
    return reply(403, "cross_origin");
  }
  const parsed = requestSchema.safeParse(
    await readTransitSubmissionJson(request),
  );
  if (!parsed.success) return reply(400, "invalid_email");
  if (!isSmtpConfigured()) return reply(503, "unavailable");

  const ipHash = hashValue(transitSubmissionClientIp(request));
  const emailHash = hashEmail(parsed.data.email);
  const ipLimit = checkRateLimit(
    `transit-verification-ip:${ipHash}`,
    5,
    15 * 60 * 1000,
  );
  const emailLimit = checkRateLimit(
    `transit-verification-email:${emailHash}`,
    3,
    15 * 60 * 1000,
  );
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return reply(429, "rate_limited", {
      retryAfterSeconds: Math.max(
        ipLimit.retryAfterSeconds,
        emailLimit.retryAfterSeconds,
      ),
    });
  }

  const code = createTransitSubmissionCode();
  const verificationId = await createTransitSubmissionVerification({
    email: parsed.data.email,
    code,
  });
  let reservation;
  try {
    reservation = await reserveEmailDelivery({
      type: "transit-submission-verification",
      recipient: parsed.data.email,
      dedupeKey: `transit-verification:${verificationId}`,
    });
    if (!reservation) throw new Error("Unable to reserve delivery");
    const english = parsed.data.locale === "en";
    const info = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: parsed.data.email,
      subject: english
        ? "Low Price Radar submission verification code"
        : "Low Price Radar 收录申请验证码",
      text: english
        ? `Your submission verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`
        : `你的收录申请验证码是：${code}\n\n验证码 10 分钟内有效。如非本人操作，请忽略此邮件。`,
    });
    if (!info.accepted?.length) throw new Error("Delivery not accepted");
    await settleEmailDelivery(reservation, {
      status: "sent",
      providerMessageId: info.messageId,
    });
    return reply(200, "code_sent", { verificationId });
  } catch {
    await deleteTransitSubmissionVerification(verificationId).catch(() => {});
    if (reservation) {
      await settleEmailDelivery(reservation, {
        status: "failed",
        error: "Transit verification delivery failed",
      }).catch(() => {});
    }
    return reply(503, "unavailable");
  }
}

export async function PUT(request: NextRequest) {
  if (!isAllowedTransitSubmissionOrigin(request)) {
    return reply(403, "cross_origin");
  }
  const parsed = confirmSchema.safeParse(
    await readTransitSubmissionJson(request),
  );
  if (!parsed.success) return reply(400, "invalid_code");
  const verified = await confirmTransitSubmissionVerification({
    id: parsed.data.verificationId,
    email: parsed.data.email,
    code: parsed.data.code,
  });
  return verified
    ? reply(200, "verified")
    : reply(400, "invalid_or_expired_code");
}
