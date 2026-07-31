import type { PriceChangeDigest } from "@/lib/collectors/persistence";
import { markPriceChangesNotified } from "@/lib/collectors/persistence";
import { isDatabaseConfigured } from "@/lib/db/client";
import { providerCatalog } from "@/lib/data/catalog";
import {
  reserveEmailDelivery,
  settleEmailDelivery,
} from "@/lib/email/delivery";
import {
  adminAlertEmail,
  apiRankingChangeEmail,
  priceChangeEmail,
  type ApiRankingEmailTable,
} from "@/lib/email/templates";
import { getEmailTransport, isSmtpConfigured } from "@/lib/email/transport";
import {
  markApiRankingEventsNotified,
  loadPendingApiRankingBatches,
  type ApiRankingHistoryResult,
} from "@/lib/pricing/ranking-history";
import { modeHref } from "@/lib/seo";
import { hashEmail } from "@/lib/security/tokens";
import {
  createUnsubscribeToken,
  listActivePriceSubscribers,
} from "@/lib/subscriptions/repository";
import {
  API_RANKING_PLAN_SLUG,
  API_RANKING_PROVIDER_SLUG,
} from "@/lib/subscriptions/scopes";

function applicationUrl(): string {
  return (
    process.env.APP_URL ??
    (isDatabaseConfigured()
      ? (() => {
          throw new Error(
            "APP_URL is required before sending production price alerts.",
          );
        })()
      : "http://localhost:3000")
  );
}

function uniqueEmailRecipients<
  T extends { email: string; subscriptionId: string },
>(recipients: T[]): T[] {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const normalized = recipient.email.trim().toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export async function notifyPriceChangeDigest(
  digest: PriceChangeDigest,
): Promise<number> {
  const recipients = uniqueEmailRecipients(
    await listActivePriceSubscribers(digest.providerSlug, digest.planSlug),
  );
  const appUrl = applicationUrl();
  const provider = providerCatalog.find(
    (candidate) => candidate.id === digest.providerSlug,
  );
  const viewUrl = new URL(
    modeHref(provider?.mode ?? "global"),
    appUrl,
  ).toString();
  const ctaLabel =
    provider?.mode === "api"
      ? "查看当前模型排第几？"
      : provider?.mode === "china-subscription"
        ? "看看还有更便宜的订阅吗？"
        : "查看还有更便宜的地区吗？";
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const deliveryId = await reserveEmailDelivery({
      type: "price_change",
      recipient: recipient.email,
      dedupeKey: `price-change:${digest.runId}:${digest.planSlug}:${hashEmail(recipient.email)}`,
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
          changePercent: change.changePercent,
        })),
        topThree: digest.topThree,
        viewUrl,
        ctaLabel,
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

function rankingSubject(result: ApiRankingHistoryResult): string {
  const withPrice = result.changes.filter(
    (change) =>
      change.currentPriceCny !== null &&
      change.previousPriceCny !== null &&
      change.currentDisplayPrice !== change.previousDisplayPrice,
  );
  const decreases = withPrice
    .filter((change) => change.currentPriceCny! < change.previousPriceCny!)
    .sort(
      (a, b) =>
        (b.previousPriceCny! - b.currentPriceCny!) / b.previousPriceCny! -
        (a.previousPriceCny! - a.currentPriceCny!) / a.previousPriceCny!,
    );
  if (decreases[0]) return `${decreases[0].modelName} 更便宜了！`;
  const increases = withPrice
    .filter((change) => change.currentPriceCny! > change.previousPriceCny!)
    .sort(
      (a, b) =>
        (b.currentPriceCny! - b.previousPriceCny!) / b.previousPriceCny! -
        (a.currentPriceCny! - a.previousPriceCny!) / a.previousPriceCny!,
    );
  if (increases[0]) return `${increases[0].modelName} 涨价了！`;
  const newcomer = result.changes.find(
    (change) => change.previousRank === null && change.currentRank !== null,
  );
  if (newcomer) return `${newcomer.modelName} 新上榜了！`;
  const climber = result.changes
    .filter(
      (change) =>
        change.previousRank !== null &&
        change.currentRank !== null &&
        change.previousRank > change.currentRank,
    )
    .sort(
      (a, b) =>
        b.previousRank! - b.currentRank! - (a.previousRank! - a.currentRank!),
    )[0];
  return climber
    ? `${climber.modelName} 排名上升了！`
    : "API 价格排行榜有新变化";
}

function rankingEmailTables(
  result: ApiRankingHistoryResult,
): ApiRankingEmailTable[] {
  const labels = {
    cached_input: "缓存输入",
    input: "非缓存输入",
    output: "输出",
  } as const;
  const changeByIdentity = new Map(
    result.changes.map((change) => [
      `${change.metric}:${change.entryKey}`,
      change,
    ]),
  );
  return (["cached_input", "input", "output"] as const).map((metric) => {
    const ranking = result.rankings[metric];
    const visible = ranking.filter((row) => {
      if (row.rank <= 3) return true;
      const change = changeByIdentity.get(`${metric}:${row.entryKey}`);
      if (!change) return false;
      const rankDelta =
        change.previousRank === null || change.currentRank === null
          ? null
          : change.previousRank - change.currentRank;
      return (
        change.previousRank === null ||
        (rankDelta !== null && rankDelta > 0) ||
        change.previousDisplayPrice !== change.currentDisplayPrice
      );
    });
    return {
      metric,
      label: labels[metric],
      rows: visible.map((row) => {
        const change = changeByIdentity.get(`${metric}:${row.entryKey}`);
        const rankDelta =
          !change || change.previousRank === null || change.currentRank === null
            ? null
            : change.previousRank - change.currentRank;
        const priceDirection =
          !change ||
          change.previousPriceCny === null ||
          change.currentPriceCny === null ||
          change.previousDisplayPrice === change.currentDisplayPrice
            ? null
            : change.currentPriceCny > change.previousPriceCny
              ? "increase"
              : change.currentPriceCny < change.previousPriceCny
                ? "decrease"
                : null;
        return {
          rank: row.rank,
          providerName: row.providerName,
          modelName: row.modelName,
          displayPrice: row.displayPrice,
          priceCny: row.priceCny,
          previousRank: change?.previousRank ?? null,
          previousDisplayPrice: change?.previousDisplayPrice ?? null,
          rankDelta,
          priceDirection,
          isNew: change?.previousRank === null && Boolean(change),
        };
      }),
    };
  });
}

export async function notifyApiRankingChanges(
  result: ApiRankingHistoryResult,
  runId: string,
): Promise<number> {
  if (result.baseline || result.changes.length === 0) return 0;
  const recipients = uniqueEmailRecipients(
    await listActivePriceSubscribers(
      API_RANKING_PROVIDER_SLUG,
      API_RANKING_PLAN_SLUG,
    ),
  );
  const appUrl = applicationUrl();
  const viewUrl = new URL("/api-pricing#api-ranking", appUrl).toString();
  const subject = rankingSubject(result);
  const tables = rankingEmailTables(result);
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const deliveryId = await reserveEmailDelivery({
      type: "api_ranking_change",
      recipient: recipient.email,
      dedupeKey: `api-ranking:${runId}:${hashEmail(recipient.email)}`,
    });
    if (!deliveryId) continue;
    try {
      const rawToken = await createUnsubscribeToken(recipient.subscriptionId);
      const unsubscribeUrl = new URL("/api/subscriptions/unsubscribe", appUrl);
      unsubscribeUrl.searchParams.set("token", rawToken);
      const message = apiRankingChangeEmail({
        subject,
        tables,
        viewUrl,
        unsubscribeUrl: unsubscribeUrl.toString(),
      });
      const delivery = await getEmailTransport().sendMail({
        from: process.env.SMTP_FROM ?? "AI Price Atlas <dev@localhost>",
        to: recipient.email,
        ...message,
      });
      await settleEmailDelivery(deliveryId, {
        status: "sent",
        providerMessageId: delivery.messageId,
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

  if (failed === 0) {
    await markApiRankingEventsNotified(
      result.changes.map((change) => change.id),
    );
  }
  if (failed > 0) {
    throw new Error(`${failed} API ranking email delivery attempt(s) failed.`);
  }
  return sent;
}

export async function notifyPendingApiRankingChanges(
  rankings: ApiRankingHistoryResult["rankings"],
): Promise<number> {
  const batches = await loadPendingApiRankingBatches(rankings);
  let sent = 0;
  for (const batch of batches) {
    sent += await notifyApiRankingChanges(batch.result, batch.runId);
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
