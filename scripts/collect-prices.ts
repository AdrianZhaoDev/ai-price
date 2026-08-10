import { config } from "dotenv";
import { createCollectorRegistry } from "@/lib/collectors/registry";
import { runCollectors } from "@/lib/collectors/runner";
import { resolveCollectionTrigger } from "@/lib/collectors/trigger";
import { closeDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { refreshPricingCacheAfterCollection } from "@/lib/pricing/cache-refresh";
import { deliverPendingSubscriptionCreatedEmails } from "@/lib/subscriptions/service";
import { dataSyncErrorMessage, runConfiguredDataSync } from "@/lib/sync";
import { syncModelsDevCatalog } from "@/lib/model-catalog/sync";
import type { ModelCatalogImportResult } from "@/lib/model-catalog/types";
import { notifyPendingModelCatalogChanges } from "@/lib/model-catalog/notifications";
import { sendAdminCollectionAlert } from "@/lib/alerts/notifier";

config({ path: [".env.local", ".env"] });

async function main() {
  const requested = process.argv
    .find((argument) => argument.startsWith("--source="))
    ?.slice("--source=".length);
  const acceptPlanCountChange = process.argv.includes(
    "--accept-plan-count-change",
  );
  const trigger = resolveCollectionTrigger(
    process.argv,
    Boolean(process.env.GITHUB_ACTIONS),
  );
  const registry = createCollectorRegistry();
  const modelCatalogOnly = requested === "models-dev";
  const adapters =
    requested && !modelCatalogOnly
      ? registry.filter((adapter) => adapter.id.includes(requested))
      : registry;

  if (adapters.length === 0 && !modelCatalogOnly) {
    throw new Error(`No collector matched --source=${requested}.`);
  }
  if (
    acceptPlanCountChange &&
    (!requested || adapters.length !== 1 || adapters[0].id !== requested)
  ) {
    throw new Error(
      "--accept-plan-count-change requires one exact --source=<adapter-id>.",
    );
  }
  if (!isDatabaseConfigured()) {
    console.warn(
      "DATABASE_URL is not configured; running verification without persistence.",
    );
  } else {
    try {
      const emailRetry = await deliverPendingSubscriptionCreatedEmails();
      if (emailRetry.attempted > 0) {
        console.log(JSON.stringify({ subscriptionEmailRetry: emailRetry }));
      }
    } catch (error) {
      console.error(
        `Subscription email retry failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  let modelCatalogResult: ModelCatalogImportResult | undefined;
  if (isDatabaseConfigured() && (!requested || modelCatalogOnly)) {
    try {
      modelCatalogResult = await syncModelsDevCatalog();
      console.log(
        JSON.stringify({ modelCatalog: modelCatalogResult }, null, 2),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Model catalog sync failed: ${message}`);
      await sendAdminCollectionAlert({
        sourceName: "models.dev catalog",
        errorCode: "MODEL_CATALOG_SYNC_FAILED",
        message,
        occurredAt: new Date().toISOString(),
        dedupeKey: `model-catalog-sync:${new Date().toISOString().slice(0, 13)}`,
      }).catch(() => false);
      process.exitCode = 1;
    }
  }

  const summary = modelCatalogOnly
    ? {
        sourceCount: 0,
        successCount: 0,
        failureCount: 0,
        offerCount: 0,
        changeCount: 0,
      }
    : await runCollectors(adapters, {
        trigger,
        concurrency: Number(process.env.COLLECTOR_CONCURRENCY ?? 5),
        onProgress: console.log,
        acceptPlanCountChange,
      });
  console.log(JSON.stringify(summary, null, 2));

  try {
    const syncResult = await runConfiguredDataSync();
    if (syncResult) {
      console.log(JSON.stringify({ dataSync: syncResult }, null, 2));
    }
  } catch (error) {
    console.error(`Data sync failed: ${dataSyncErrorMessage(error)}`);
    process.exitCode = 1;
  }

  try {
    const cacheRefresh = await refreshPricingCacheAfterCollection({
      catalogVersion: modelCatalogResult?.catalogVersion,
      catalogChanged: modelCatalogResult?.changed,
      changedModelIds: modelCatalogResult?.changedModelIds,
    });
    if (cacheRefresh.refreshed) {
      console.log("Pricing page caches revalidated and prewarmed.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Pricing cache refresh failed: ${message}`);
    await sendAdminCollectionAlert({
      sourceName: modelCatalogResult ? "model catalog ISR" : "pricing cache",
      errorCode: modelCatalogResult
        ? "MODEL_CATALOG_REBUILD_FAILED"
        : "PRICING_CACHE_REFRESH_FAILED",
      message,
      occurredAt: new Date().toISOString(),
      dedupeKey: `${modelCatalogResult ? "model-catalog-rebuild" : "pricing-cache-refresh"}:${new Date().toISOString().slice(0, 13)}`,
    }).catch(() => false);
    process.exitCode = 1;
  }

  if (isDatabaseConfigured() && process.exitCode !== 1) {
    try {
      const sent = await notifyPendingModelCatalogChanges();
      if (sent > 0)
        console.log(JSON.stringify({ modelCatalogEmailsSent: sent }));
    } catch (error) {
      console.error(
        `Model catalog notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  }

  if (summary.failureCount > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
