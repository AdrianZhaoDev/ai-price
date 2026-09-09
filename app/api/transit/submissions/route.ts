import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isIP } from "node:net";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";
import {
  reserveEmailDelivery,
  settleEmailDelivery,
} from "@/lib/email/delivery";
import {
  isAllowedTransitSubmissionOrigin,
  readTransitSubmissionJson,
  transitSubmissionClientIp,
} from "@/lib/transit/submission-http";
import {
  createTransitSubmission,
  transitWebsiteKey,
} from "@/lib/transit/submissions";

const schema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[^\r\n\u0000-\u001f\u007f]+$/),
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .transform((value, ctx) => {
        try {
          const url = new URL(value);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
            !url.hostname.includes(".") ||
            /\.(localhost|local|internal|test|invalid|example)$/.test(
              url.hostname,
            )
          )
            throw new Error();
          url.hash = "";
          return url.href;
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid website URL" });
          return z.NEVER;
        }
      }),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
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
  if (!isAllowedTransitSubmissionOrigin(request))
    return reply(403, "cross_origin");
  const body = await readTransitSubmissionJson(request);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return reply(400, "invalid_url");
  const result = await createTransitSubmission({
    verificationId: parsed.data.verificationId,
    email: parsed.data.email,
    websiteUrl: parsed.data.url,
    description: parsed.data.description,
    ipAddress: transitSubmissionClientIp(request),
  });
  const contact = process.env.ADMIN_EMAIL || process.env.CONTACT_EMAIL;
  if (result === "duplicate") return reply(200, "duplicate", { contact });
  if (result === "rate_limited") return reply(429, "rate_limited");
  if (result === "verification_required")
    return reply(400, "verification_required");

  const recipient = process.env.ADMIN_EMAIL || process.env.CONTACT_EMAIL;
  if (!recipient || !isSmtpConfigured()) return reply(200, "submitted");
  const dedupeKey = `transit-submission:${transitWebsiteKey(parsed.data.url)}`;
  let reservation;
  try {
    reservation = await reserveEmailDelivery({
      type: "transit-submission",
      recipient,
      dedupeKey,
    });
    if (!reservation) return reply(200, "submitted");
    // The submitted URL is plain text only; never fetch it or publish it automatically.
    const info = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: recipient,
      subject: "API 中转站收录申请",
      text: `网站链接：${parsed.data.url}\n一句话介绍：${parsed.data.description}\n申请邮箱：${parsed.data.email}\n\n邮箱已通过验证码验证，请人工审核后收录。`,
    });
    if (!info.accepted?.length) throw new Error("Delivery not accepted");
    await settleEmailDelivery(reservation, {
      status: "sent",
      providerMessageId: info.messageId,
    });
    return reply(200, "submitted");
  } catch {
    if (reservation)
      await settleEmailDelivery(reservation, {
        status: "failed",
        error: "Transit submission delivery failed",
      }).catch(() => {});
    return reply(200, "submitted");
  }
}
