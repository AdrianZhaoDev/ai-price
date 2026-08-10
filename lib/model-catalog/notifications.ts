import { and, asc, eq, isNull } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { modelCatalogEvents, modelCatalogImports } from "@/lib/db/schema";
import {
  isEmailDeliverySent,
  reserveEmailDelivery,
  settleEmailDelivery,
} from "@/lib/email/delivery";
import { modelCatalogDigestEmail } from "@/lib/email/templates";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";
import { hashEmail } from "@/lib/security/tokens";
import {
  createUnsubscribeToken,
  listActivePriceSubscribers,
} from "@/lib/subscriptions/repository";
import {
  API_MODEL_NEW_PLAN_SLUG,
  API_MODEL_NEW_PROVIDER_SLUG,
} from "@/lib/subscriptions/scopes";
import { modelDetailPath } from "./paths";

type AddedModelSnapshot = {
  name: string;
  labName: string;
  releaseDate: string;
};

export async function notifyPendingModelCatalogChanges(): Promise<number> {
  if (!isDatabaseConfigured() || !isSmtpConfigured()) return 0;
  const db = getDatabase();
  const pending = await db
    .select({
      event: modelCatalogEvents,
      importId: modelCatalogImports.id,
      version: modelCatalogImports.version,
    })
    .from(modelCatalogEvents)
    .innerJoin(
      modelCatalogImports,
      eq(modelCatalogImports.id, modelCatalogEvents.importId),
    )
    .where(
      and(
        eq(modelCatalogEvents.eventType, "model_added"),
        isNull(modelCatalogEvents.notifiedAt),
      ),
    )
    .orderBy(asc(modelCatalogEvents.createdAt));
  if (pending.length === 0) return 0;

  const batches = new Map<string, typeof pending>();
  for (const row of pending)
    batches.set(row.importId, [...(batches.get(row.importId) ?? []), row]);
  const subscribers = await listActivePriceSubscribers(
    API_MODEL_NEW_PROVIDER_SLUG,
    API_MODEL_NEW_PLAN_SLUG,
  );
  const baseUrl = process.env.APP_URL;
  if (!baseUrl)
    throw new Error("APP_URL is required before sending model catalog alerts.");
  let sent = 0;

  for (const [importId, rows] of batches) {
    const version = rows[0].version;
    const eventCreatedAt = rows[0].event.createdAt;
    let failures = 0;
    for (const subscriber of subscribers.filter(
      (candidate) => candidate.activeSince <= eventCreatedAt,
    )) {
      const dedupeKey = `model-catalog:${importId}:${hashEmail(subscriber.email)}`;
      const reservation = await reserveEmailDelivery({
        type: "model_catalog_added",
        recipient: subscriber.email,
        dedupeKey,
      });
      if (!reservation) {
        if (!(await isEmailDeliverySent(dedupeKey))) failures += 1;
        continue;
      }
      try {
        const token = await createUnsubscribeToken(subscriber.subscriptionId);
        const unsubscribeUrl = new URL(
          "/api/subscriptions/unsubscribe",
          baseUrl,
        );
        unsubscribeUrl.searchParams.set("token", token);
        const models = rows.map(({ event }) => {
          const snapshot = event.snapshot as AddedModelSnapshot;
          return {
            ...snapshot,
            url: new URL(modelDetailPath(event.modelId), baseUrl).toString(),
          };
        });
        const result = await getEmailTransport().sendMail({
          from: process.env.SMTP_FROM,
          to: subscriber.email,
          ...modelCatalogDigestEmail({
            models,
            catalogVersion: version,
            viewUrl: new URL("/api-pricing", baseUrl).toString(),
            unsubscribeUrl: unsubscribeUrl.toString(),
          }),
        });
        await settleEmailDelivery(reservation, {
          status: "sent",
          providerMessageId: result.messageId,
        });
        sent += 1;
      } catch (error) {
        failures += 1;
        await settleEmailDelivery(reservation, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (failures === 0) {
      await db
        .update(modelCatalogEvents)
        .set({ notifiedAt: new Date() })
        .where(eq(modelCatalogEvents.importId, rows[0].event.importId));
    } else {
      console.error(
        `${failures} model catalog email delivery attempt(s) failed for import ${importId}; later imports will continue.`,
      );
    }
  }
  return sent;
}
