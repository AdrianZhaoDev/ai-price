import type { PriceChangeDigest } from "@/lib/collectors/persistence";
import { markPriceChangesNotified } from "@/lib/collectors/persistence";
import { isDatabaseConfigured, getDatabase } from "@/lib/db/client";
import { emailDeliveries } from "@/lib/db/schema";
import { adminAlertEmail, priceChangeEmail } from "@/lib/email/templates";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";
import { hashEmail } from "@/lib/security/tokens";
import {
  createUnsubscribeToken,
  listActivePriceSubscribers,
} from "@/lib/subscriptions/repository";
import { eq } from "drizzle-orm";

async function reserveDelivery(input: {
  type: string;
  recipient: string;
  dedupeKey: string;
}): Promise<string | null> {
  if (!isDatabaseConfigured()) return crypto.randomUUID();
  const [delivery] = await getDatabase()
    .insert(emailDeliveries)
    .values({
      messageType: input.type,
      recipientHash: hashEmail(input.recipient),
      dedupeKey: input.dedupeKey,
      status: "sending",
    })
    .onConflictDoNothing()
    .returning({ id: emailDeliveries.id });
  if (delivery) return delivery.id;

  const [existing] = await getDatabase()
    .select({
      id: emailDeliveries.id,
      status: emailDeliveries.status,
    })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.dedupeKey, input.dedupeKey))
    .limit(1);
  if (existing?.status !== "failed") return null;
  await getDatabase()
    .update(emailDeliveries)
    .set({ status: "sending", error: null })
    .where(eq(emailDeliveries.id, existing.id));
  return existing.id;
}

async function settleDelivery(
  deliveryId: string,
  input: {
    status: "sent" | "failed";
    providerMessageId?: string;
    error?: string;
  },
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDatabase()
    .update(emailDeliveries)
    .set({
      status: input.status,
      providerMessageId: input.providerMessageId,
      error: input.error,
      sentAt: input.status === "sent" ? new Date() : null,
    })
    .where(eq(emailDeliveries.id, deliveryId));
}

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
    const deliveryId = await reserveDelivery({
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
      await settleDelivery(deliveryId, {
        status: "sent",
        providerMessageId: result.messageId,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      await settleDelivery(deliveryId, {
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
  const deliveryId = await reserveDelivery({
    type: "admin_collection_alert",
    recipient,
    dedupeKey: input.dedupeKey,
  });
  if (!deliveryId) return false;

  try {
    const result = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: recipient,
      ...adminAlertEmail(input),
    });
    await settleDelivery(deliveryId, {
      status: "sent",
      providerMessageId: result.messageId,
    });
    return true;
  } catch (error) {
    await settleDelivery(deliveryId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
