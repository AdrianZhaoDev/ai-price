import { persistModelCatalog } from "@/lib/model-catalog/persistence";
import { fetchModelsDevCatalog } from "@/lib/model-catalog/source";
import type { ModelCatalogImportResult } from "@/lib/model-catalog/types";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";
import {
  collectionErrors,
  modelCatalogImports,
  products,
  providers as pricingProviders,
  sources,
} from "@/lib/db/schema";
import { contentHash } from "@/lib/model-catalog/source";
import {
  finishCollectionRun,
  markCollectionAlertFailed,
  markCollectionAlertSent,
  markSourceAttempt,
  recordCollectionFailure,
  startCollectionRun,
} from "@/lib/collectors/persistence";
import { sendAdminCollectionAlert } from "@/lib/alerts/notifier";
import {
  errorDiagnosticDetails,
  redactDiagnosticText,
} from "@/lib/collectors/diagnostics";
import { and, eq, isNull } from "drizzle-orm";

const MODEL_CATALOG_SOURCE_SLUG = "models-dev-catalog";
const MODEL_CATALOG_SOURCE_URL = "https://github.com/anomalyco/models.dev";
const MODEL_CATALOG_PARSER_VERSION = "models.dev-v1";

async function ensureModelCatalogDiagnosticSource(): Promise<string> {
  return getDatabase().transaction(async (tx) => {
    const [provider] = await tx
      .insert(pricingProviders)
      .values({
        slug: MODEL_CATALOG_SOURCE_SLUG,
        name: "models.dev",
      })
      .onConflictDoUpdate({
        target: pricingProviders.slug,
        set: { name: "models.dev", updatedAt: new Date() },
      })
      .returning({ id: pricingProviders.id });
    const [product] = await tx
      .insert(products)
      .values({
        providerId: provider.id,
        slug: MODEL_CATALOG_SOURCE_SLUG,
        name: "models.dev model catalog",
        mode: "api",
        metadata: { hiddenDiagnosticSource: true },
      })
      .onConflictDoUpdate({
        target: [products.providerId, products.slug],
        set: {
          name: "models.dev model catalog",
          enabled: true,
          metadata: { hiddenDiagnosticSource: true },
          updatedAt: new Date(),
        },
      })
      .returning({ id: products.id });
    const [source] = await tx
      .insert(sources)
      .values({
        productId: product.id,
        slug: MODEL_CATALOG_SOURCE_SLUG,
        type: "community_catalog",
        url: MODEL_CATALOG_SOURCE_URL,
        parserVersion: MODEL_CATALOG_PARSER_VERSION,
      })
      .onConflictDoUpdate({
        target: [sources.productId, sources.slug],
        set: {
          type: "community_catalog",
          url: MODEL_CATALOG_SOURCE_URL,
          parserVersion: MODEL_CATALOG_PARSER_VERSION,
          enabled: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: sources.id });
    return source.id;
  });
}

export async function syncModelsDevCatalog(
  options: {
    fetchImplementation?: typeof fetch;
    trigger?: string;
  } = {},
): Promise<ModelCatalogImportResult> {
  let attemptedVersion = "unknown";
  const diagnosticSourceId = isDatabaseConfigured()
    ? await ensureModelCatalogDiagnosticSource()
    : null;
  const runId = diagnosticSourceId
    ? await startCollectionRun(options.trigger ?? "manual", 1)
    : null;
  if (diagnosticSourceId) await markSourceAttempt(diagnosticSourceId);
  try {
    const catalog = await fetchModelsDevCatalog(options.fetchImplementation);
    attemptedVersion = catalog.version;
    const result = await persistModelCatalog(catalog);
    if (diagnosticSourceId && runId) {
      const now = new Date();
      await getDatabase().transaction(async (tx) => {
        await tx
          .update(sources)
          .set({
            consecutiveFailures: 0,
            lastSuccessAt: now,
            lastContentHash: catalog.contentHash,
            lastOfferCount: result.offeringCount,
            updatedAt: now,
          })
          .where(eq(sources.id, diagnosticSourceId));
        await tx
          .update(collectionErrors)
          .set({ resolvedAt: now })
          .where(
            and(
              eq(collectionErrors.sourceId, diagnosticSourceId),
              isNull(collectionErrors.resolvedAt),
            ),
          );
      });
      await finishCollectionRun({
        runId,
        successCount: 1,
        failureCount: 0,
      });
    }
    return result;
  } catch (error) {
    const message = redactDiagnosticText(
      error instanceof Error ? error.message : String(error),
    );
    if (isDatabaseConfigured()) {
      await getDatabase()
        .insert(modelCatalogImports)
        .values({
          version: attemptedVersion,
          contentHash: contentHash({
            attemptedVersion,
            message,
            attemptedAt: new Date().toISOString(),
          }),
          status: "failed",
          error: message,
          fetchedAt: new Date(),
        })
        .catch((recordError) =>
          console.error(
            "Failed to record model catalog import error.",
            recordError,
          ),
        );
    }
    if (diagnosticSourceId && runId) {
      const recorded = await recordCollectionFailure({
        runId,
        sourceId: diagnosticSourceId,
        trigger: options.trigger ?? "manual",
        code: "MODEL_CATALOG_SYNC_FAILED",
        message,
        details: errorDiagnosticDetails(error),
      });
      await finishCollectionRun({
        runId,
        successCount: 0,
        failureCount: 1,
      });
      if (recorded.shouldAlert) {
        const alerted = await sendAdminCollectionAlert({
          sourceName: "models.dev catalog",
          errorCode: "MODEL_CATALOG_SYNC_FAILED",
          message,
          occurredAt: new Date().toISOString(),
          dedupeKey: `collector:${recorded.errorId}`,
        });
        if (alerted) await markCollectionAlertSent(recorded.errorId);
        else await markCollectionAlertFailed(recorded.errorId);
      }
    }
    throw error;
  }
}
