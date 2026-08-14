import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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
import { modelReleaseWatchPath } from "@/lib/model-release-watch";
import { modelDetailPath } from "./paths";

type AddedModelSnapshot = {
  name: string;
  labName: string;
  releaseDate: string;
};

const MODEL_CATALOG_TIME_ZONE = "Asia/Shanghai";
const MODEL_RELEASE_LOOKBACK_DAYS = 2;

function calendarDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function calendarDayNumber(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / 86_400_000);
}

export function isModelReleaseDateWithinRecentDays(
  releaseDate: unknown,
  referenceAt: Date,
): releaseDate is string {
  if (typeof releaseDate !== "string") return false;
  const releaseDay = calendarDayNumber(releaseDate);
  const today = calendarDateInTimeZone(referenceAt, MODEL_CATALOG_TIME_ZONE);
  const todayDay = calendarDayNumber(today);
  if (releaseDay === null || todayDay === null) return false;
  const age = todayDay - releaseDay;
  return age >= 0 && age < MODEL_RELEASE_LOOKBACK_DAYS;
}

export async function notifyPendingModelCatalogChanges(
  referenceAt = new Date(),
): Promise<number> {
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

  const eligible = [] as typeof pending;
  const ignoredEventIds: string[] = [];
  for (const row of pending) {
    const snapshot = row.event.snapshot as Partial<AddedModelSnapshot>;
    if (isModelReleaseDateWithinRecentDays(snapshot.releaseDate, referenceAt)) {
      eligible.push(row);
    } else {
      ignoredEventIds.push(row.event.id);
    }
  }
  if (ignoredEventIds.length > 0) {
    await db
      .update(modelCatalogEvents)
      .set({ notifiedAt: new Date() })
      .where(inArray(modelCatalogEvents.id, ignoredEventIds));
  }
  if (eligible.length === 0) return 0;

  const batches = new Map<string, typeof eligible>();
  for (const row of eligible)
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
      const dedupeKey = `model-catalog:${importId}:${hashEmail(subscriber.email)}${subscriber.locale === "en" ? ":en" : ""}`;
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
        unsubscribeUrl.searchParams.set("locale", subscriber.locale);
        const models = rows.map(({ event }) => {
          const snapshot = event.snapshot as AddedModelSnapshot;
          const modelUrl = new URL(
            modelDetailPath(event.modelId, subscriber.locale),
            baseUrl,
          );
          modelUrl.searchParams.set("locale", subscriber.locale);
          return {
            id: event.modelId,
            ...snapshot,
            url: modelUrl.toString(),
          };
        });
        const viewUrl = new URL(
          subscriber.locale === "en" ? "/en/api-pricing" : "/api-pricing",
          baseUrl,
        );
        viewUrl.searchParams.set("locale", subscriber.locale);
        const releaseWatchUrl = new URL(
          modelReleaseWatchPath(subscriber.locale),
          baseUrl,
        );
        const result = await getEmailTransport().sendMail({
          from: process.env.SMTP_FROM,
          to: subscriber.email,
          ...modelCatalogDigestEmail({
            locale: subscriber.locale,
            models,
            catalogVersion: version,
            viewUrl: viewUrl.toString(),
            releaseWatchUrl: releaseWatchUrl.toString(),
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
