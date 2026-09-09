import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isIP } from "node:net";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";
import {
  reserveEmailDelivery,
  settleEmailDelivery,
  isEmailDeliverySent,
} from "@/lib/email/delivery";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hashValue } from "@/lib/security/tokens";
import { allowTransitSubmissionAttempt } from "@/lib/security/transit-submission-rate-limit";

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
          return url.href;
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid website URL" });
          return z.NEVER;
        }
      }),
  })
  .strict();

function reply(status: number, code: string) {
  return NextResponse.json(
    { code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url);
  if (origin && origin !== expected.origin) {
    try {
      const incoming = new URL(origin);
      const loopback = ["localhost", "127.0.0.1", "[::1]"];
      if (
        process.env.NODE_ENV === "production" ||
        !loopback.includes(expected.hostname) ||
        !loopback.includes(incoming.hostname) ||
        incoming.protocol !== expected.protocol ||
        incoming.port !== expected.port
      )
        return reply(403, "cross_origin");
    } catch {
      return reply(403, "cross_origin");
    }
  }
  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  if (!allowTransitSubmissionAttempt(ip)) return reply(429, "rate_limited");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply(400, "invalid_request");
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "invalid_request");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return reply(400, "invalid_request");
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply(400, "invalid_request");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return reply(400, "invalid_url");
  // Malformed input never consumes the shared SMTP budget.
  if (!checkRateLimit("transit-submissions", 20, 60 * 60 * 1000).allowed)
    return reply(429, "rate_limited");
  const recipient = process.env.ADMIN_EMAIL || process.env.CONTACT_EMAIL;
  if (!recipient || !isSmtpConfigured()) return reply(503, "unavailable");
  const dedupeKey = `transit-submission:${new Date().toISOString().slice(0, 10)}:${hashValue(JSON.stringify(parsed.data))}`;
  let reservation;
  try {
    reservation = await reserveEmailDelivery({
      type: "transit-submission",
      recipient,
      dedupeKey,
    });
    if (!reservation)
      return (await isEmailDeliverySent(dedupeKey))
        ? reply(200, "submitted")
        : reply(503, "retry_later");
    // The submitted URL is plain text only; never fetch it or publish it automatically.
    const info = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: recipient,
      subject: "API 中转站收录申请",
      text: `网站链接：${parsed.data.url}\n一句话介绍：${parsed.data.description}\n\n请人工审核后收录。`,
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
    return reply(503, "unavailable");
  }
}
