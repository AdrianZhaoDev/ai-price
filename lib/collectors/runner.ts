import {
  notifyPriceChangeDigest,
  sendAdminCollectionAlert,
} from "@/lib/alerts/notifier";
import {
  buildPriceChangeDigests,
  ensureSource,
  finishCollectionRun,
  markCollectionAlertFailed,
  markCollectionAlertSent,
  markPriceChangesNotified,
  markSourceAttempt,
  recordCollectionFailure,
  recordSuccessfulCollection,
  startCollectionRun,
  type SourceReference,
  type PriceChange,
} from "@/lib/collectors/persistence";
import {
  CollectionError,
  type PriceSourceAdapter,
} from "@/lib/collectors/types";
import { appStorefronts } from "@/lib/collectors/adapters/app-store";
import { refreshFxRates, type FxRate } from "@/lib/collectors/fx";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  errorDiagnosticDetails,
  redactDiagnosticText,
} from "@/lib/collectors/diagnostics";

export type CollectionSummary = {
  sourceCount: number;
  successCount: number;
  failureCount: number;
  offerCount: number;
  changeCount: number;
};

type RunOptions = {
  trigger?: string;
  concurrency?: number;
  onProgress?: (message: string) => void;
  acceptPlanCountChange?: boolean;
};

async function mapConcurrent<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(values[index]);
      }
    },
  );
  await Promise.all(runners);
}

function failureDetails(error: unknown): {
  code: string;
  message: string;
  details: Record<string, unknown>;
} {
  if (error instanceof CollectionError) {
    return {
      code: error.code,
      message: redactDiagnosticText(error.message),
      details: error.details,
    };
  }
  return {
    code: "COLLECTION_FAILED",
    message: redactDiagnosticText(
      error instanceof Error ? error.message : String(error),
    ),
    details: errorDiagnosticDetails(error),
  };
}

export async function runCollectors(
  adapters: PriceSourceAdapter[],
  options: RunOptions = {},
): Promise<CollectionSummary> {
  const databaseEnabled = isDatabaseConfigured();
  const observedAt = new Date();
  const fxRates: Map<string, FxRate> = databaseEnabled
    ? await refreshFxRates(
        ["CNY", ...appStorefronts.map((storefront) => storefront.currency)],
        observedAt,
      )
    : new Map();
  const runId = databaseEnabled
    ? await startCollectionRun(options.trigger ?? "manual", adapters.length)
    : null;
  const summary: CollectionSummary = {
    sourceCount: adapters.length,
    successCount: 0,
    failureCount: 0,
    offerCount: 0,
    changeCount: 0,
  };
  const collectedChanges: PriceChange[] = [];

  await mapConcurrent(adapters, options.concurrency ?? 5, async (adapter) => {
    let source: SourceReference | null = null;
    try {
      if (databaseEnabled) {
        source = await ensureSource(adapter);
        await markSourceAttempt(source.id);
      }
      let raw = await adapter.collect({ observedAt });
      let offers = await adapter.parse(raw);
      let health = adapter.healthCheck(offers);
      if (!health.ok) {
        raw = await adapter.collect({ observedAt });
        offers = await adapter.parse(raw);
        health = adapter.healthCheck(offers);
      }
      if (!health.ok) {
        throw new CollectionError(
          health.code,
          health.message,
          health.details ?? {},
        );
      }
      if (
        source?.lastOfferCount &&
        !options.acceptPlanCountChange &&
        !adapter.id.includes("-app-store-") &&
        source.lastOfferCount - offers.length >= 2 &&
        offers.length < source.lastOfferCount * 0.7
      ) {
        throw new CollectionError(
          "PLAN_COUNT_COLLAPSE",
          `Offer count fell from ${source.lastOfferCount} to ${offers.length}.`,
        );
      }

      let changeCount = 0;
      if (databaseEnabled && runId && source) {
        const changes = await recordSuccessfulCollection({
          runId,
          source,
          contentHash: raw.contentHash,
          offers,
          fxRates,
        });
        changeCount = changes.length;
        collectedChanges.push(...changes);
        for (const change of changes) {
          if (
            change.changePercent !== null &&
            Math.abs(change.changePercent) > 50
          ) {
            await sendAdminCollectionAlert({
              sourceName: adapter.id,
              errorCode: "PRICE_JUMP",
              message: `${change.planName}: ${change.previousPrice} → ${change.currentPrice} (${change.changePercent}%)`,
              occurredAt: new Date().toISOString(),
              dedupeKey: `price-jump:${change.eventId}`,
            });
          }
        }
      }

      summary.successCount += 1;
      summary.offerCount += offers.length;
      summary.changeCount += changeCount;
      options.onProgress?.(
        `✓ ${adapter.id}: ${offers.length} offers${changeCount ? `, ${changeCount} changes` : ""}`,
      );
    } catch (error) {
      summary.failureCount += 1;
      const failure = failureDetails(error);
      options.onProgress?.(
        `✗ ${adapter.id}: ${failure.code} ${failure.message}`,
      );

      if (databaseEnabled && runId && source) {
        const recorded = await recordCollectionFailure({
          runId,
          sourceId: source.id,
          ...failure,
        });
        if (recorded.shouldAlert) {
          const alerted = await sendAdminCollectionAlert({
            sourceName: adapter.id,
            errorCode: failure.code,
            message: failure.message,
            occurredAt: new Date().toISOString(),
            dedupeKey: `collector:${recorded.errorId}`,
          });
          if (alerted) {
            await markCollectionAlertSent(recorded.errorId);
          } else {
            await markCollectionAlertFailed(recorded.errorId);
          }
        }
      }
    }
  });

  if (databaseEnabled && runId) {
    await finishCollectionRun({
      runId,
      successCount: summary.successCount,
      failureCount: summary.failureCount,
    });
    try {
      const { digests, ignoredEventIds } = await buildPriceChangeDigests(
        runId,
        collectedChanges,
      );
      await markPriceChangesNotified(ignoredEventIds);
      for (const digest of digests) {
        try {
          await notifyPriceChangeDigest(digest);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          options.onProgress?.(
            `✗ email-${digest.planSlug}: DELIVERY_FAILED ${message}`,
          );
          await sendAdminCollectionAlert({
            sourceName: `email-${digest.planSlug}`,
            errorCode: "DELIVERY_FAILED",
            message,
            occurredAt: new Date().toISOString(),
            dedupeKey: `price-email:${runId}:${digest.planSlug}`,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onProgress?.(`✗ price-ranking: RANKING_FAILED ${message}`);
      await sendAdminCollectionAlert({
        sourceName: "price-ranking",
        errorCode: "RANKING_FAILED",
        message,
        occurredAt: new Date().toISOString(),
        dedupeKey: `price-ranking:${runId}`,
      });
    }
  }
  return summary;
}
