import type { PriceChangeDigest } from "@/lib/collectors/persistence";
import { markPriceChangesNotified } from "@/lib/collectors/persistence";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  reserveEmailDelivery,
  settleEmailDelivery,
} from "@/lib/email/delivery";
import { adminAlertEmail, priceChangeEmail } from "@/lib/email/templates";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";
import {
  createUnsubscribeToken,
  listActivePriceSubscribers,
} from "@/lib/subscriptions/repository";

export async function notifyPriceChangeDigest(
  digest: PriceChangeDigest,
): Promise<number> {
  const recipients = await listActivePriceSubscribers(
    digest.providerSlug,
    digest.planSlug,
  );
  const appUrl =
    process.env.APP_URL ??
    (isDatabaseConfigured()
      ? (() => {
          throw new Error(
            "APP_URL is required before sending production price alerts.",
          );
        })()
      : "http://localhost:3000");
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const deliveryId = await reserveEmailDelivery({
      type: "price_change",
      recipient: recipient.email,
      dedupeKey: `price-change:${digest.runId}:${digest.planSlug}:${recipient.subscriptionId}`,
    });
    if (!deliveryId) continue;

    try {
      const rawToken = await createUnsubscribeToken(recipient.subscriptionId);
      const unsubscribeUrl = new URL("/api/subscriptions/unsubscribe", appUrl);
      unsubscribeUrl.searchParams.set("token", rawToken);
      const message = priceChangeEmail({
        scopeLabel: digest.planName,
        changes: digest.changes.map((change) => ({
          region: change.region,
          previousPrice: change.previousPrice,
          currentPrice: change.currentPrice,
          previousCny: change.previousCny,
          currentCny: change.currentCny,
        })),
        topThree: digest.topThree,
        unsubscribeUrl: unsubscribeUrl.toString(),
      });
      const result = await getEmailTransport().sendMail({
        from: process.env.SMTP_FROM ?? "AI Price Atlas <dev@localhost>",
        to: recipient.email,
        ...message,
      });
      await settleEmailDelivery(deliveryId, {
        status: "sent",
        providerMessageId: result.messageId,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      await settleEmailDelivery(deliveryId, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failed === 0 && isDatabaseConfigured()) {
    await markPriceChangesNotified(digest.eventIds);
  }
  if (failed > 0) {
    throw new Error(`${failed} price-change email delivery attempt(s) failed.`);
  }
  return sent;
}

export async function sendAdminCollectionAlert(input: {
  sourceName: string;
  errorCode: string;
  message: string;
  occurredAt: string;
  dedupeKey: string;
}): Promise<boolean> {
  const recipient = process.env.ADMIN_EMAIL;
  if (!recipient || !isSmtpConfigured()) return false;
  const deliveryId = await reserveEmailDelivery({
    type: "admin_collection_alert",
    recipient,
    dedupeKey: input.dedupeKey,
  });
  if (!deliveryId) return false;

  try {
    const adminUrl = process.env.APP_URL
      ? new URL(
          `/admin/errors?code=${encodeURIComponent(input.errorCode)}&status=open`,
          process.env.APP_URL,
        ).toString()
      : undefined;
    const result = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: recipient,
      ...adminAlertEmail({ ...input, adminUrl }),
    });
    await settleEmailDelivery(deliveryId, {
      status: "sent",
      providerMessageId: result.messageId,
    });
    return true;
  } catch (error) {
    await settleEmailDelivery(deliveryId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
