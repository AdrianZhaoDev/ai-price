import {
  reserveEmailDelivery,
  settleEmailDelivery,
} from "@/lib/email/delivery";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";

export async function sendAdminLoginCode(code: string): Promise<void> {
  const recipient = process.env.ADMIN_EMAIL;
  if (!recipient) throw new Error("ADMIN_EMAIL is not configured.");
  if (!isSmtpConfigured()) throw new Error("SMTP is not configured.");

  const deliveryId = await reserveEmailDelivery({
    type: "admin_login_code",
    recipient,
    dedupeKey: `admin-login:${Date.now()}:${crypto.randomUUID()}`,
  });
  if (!deliveryId) throw new Error("Unable to reserve email delivery.");

  try {
    const result = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: recipient,
      subject: "AI 价签管理员登录验证码",
      text: `你的管理员登录验证码是：${code}\n\n验证码 10 分钟内有效。如非本人操作，请忽略此邮件。`,
    });
    await settleEmailDelivery(deliveryId, {
      status: "sent",
      providerMessageId: result.messageId,
    });
  } catch (error) {
    await settleEmailDelivery(deliveryId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
