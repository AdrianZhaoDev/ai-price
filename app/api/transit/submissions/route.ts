import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isIP } from "node:net";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";
import {
  isEmailDeliverySent,
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
  markTransitSubmissionNotification,
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
          const hostname = url.hostname.replace(/\.$/, "");
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            isIP(hostname.replace(/^\[|\]$/g, "")) ||
            !hostname.includes(".") ||
            /\.(localhost|local|internal|test|invalid|example)$/.test(hostname)
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
  const contact = process.env.CONTACT_EMAIL;
  if (result.status === "duplicate")
    return reply(200, "duplicate", { contact });
  if (result.status === "rate_limited") return reply(429, "rate_limited");
  if (result.status === "verification_required")
    return reply(400, "verification_required");

  const recipient = process.env.ADMIN_EMAIL || process.env.CONTACT_EMAIL;
  const successReply = () =>
    result.alreadySubmitted
      ? reply(200, "duplicate", { contact })
      : reply(200, "submitted");
  const markNotification = (status: "sent" | "failed") =>
    markTransitSubmissionNotification({
      submissionId: result.submissionId,
      status,
    });
  if (!recipient || !isSmtpConfigured()) {
    await markNotification("failed");
    return reply(503, "unavailable");
  }
  const dedupeKey = `transit-submission:${transitWebsiteKey(result.websiteUrl)}`;
  let reservation;
  let delivered = false;
  try {
    reservation = await reserveEmailDelivery({
      type: "transit-submission",
      recipient,
      dedupeKey,
    });
    if (!reservation) {
      if (await isEmailDeliverySent(dedupeKey)) {
        await markNotification("sent");
        return successReply();
      }
      return reply(503, "retry_later");
    }
    // The submitted URL is plain text only; never fetch it or publish it automatically.
    const info = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: recipient,
      subject: "API 中转站收录申请",
      text: `网站链接：${result.websiteUrl}\n一句话介绍：${result.description}\n申请邮箱：${result.submitterEmail}\n\n邮箱已通过验证码验证，请人工审核后收录。`,
    });
    if (!info.accepted?.length) throw new Error("Delivery not accepted");
    delivered = true;
    try {
      await settleEmailDelivery(reservation, {
        status: "sent",
        providerMessageId: info.messageId,
      });
    } catch {
      // The provider accepted the message, so keep the submission even if the
      // delivery audit row could not be finalized.
    }
    await markNotification("sent");
    return successReply();
  } catch {
    if (delivered) {
      await markNotification("sent").catch(() => {});
      return successReply();
    }
    if (reservation)
      await settleEmailDelivery(reservation, {
        status: "failed",
        error: "Transit submission delivery failed",
      }).catch(() => {});
    await markNotification("failed").catch(() => {});
    return reply(503, "unavailable");
  }
}
