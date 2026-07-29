import {
  createDatabaseConnection,
  getDatabase,
  getWriteDatabaseUrl,
} from "@/lib/db/client";
import {
  collectionErrors,
  collectionRuns,
  fxRates,
  plans,
  priceChangeCandidates,
  priceChangeEvents,
  priceObservations,
  products,
  providers,
  sources,
} from "@/lib/db/schema";
import type { DataSyncTableCounts } from "@/lib/sync/types";
import { sql } from "drizzle-orm";

const BATCH_SIZE = 200;

function batches<T>(rows: T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    result.push(rows.slice(index, index + BATCH_SIZE));
  }
  return result;
}

function excluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

export async function syncPostgresqlData(
  targetUrl: string,
): Promise<DataSyncTableCounts> {
  const sourceUrl = getWriteDatabaseUrl();
  if (!sourceUrl) {
    throw new Error("The configured write database is unavailable for sync.");
  }
  if (sourceUrl === targetUrl) {
    throw new Error("Data sync source and target databases must be different.");
  }

  const source = getDatabase();
  const [
    providerRows,
    productRows,
    planRows,
    sourceRows,
    collectionRunRows,
    fxRateRows,
    observationRows,
    changeCandidateRows,
    changeEventRows,
    collectionErrorRows,
  ] = await source.transaction(
    async (snapshot) =>
      Promise.all([
        snapshot.select().from(providers),
        snapshot.select().from(products),
        snapshot.select().from(plans),
        snapshot.select().from(sources),
        snapshot.select().from(collectionRuns),
        snapshot.select().from(fxRates),
        snapshot.select().from(priceObservations),
        snapshot.select().from(priceChangeCandidates),
        snapshot.select().from(priceChangeEvents),
        snapshot.select().from(collectionErrors),
      ]),
    {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    },
  );

  const targetConnection = createDatabaseConnection(targetUrl, 2);
  try {
    await targetConnection.database.transaction(async (target) => {
      await target.delete(collectionErrors);
      await target.delete(priceChangeEvents);
      await target.delete(priceChangeCandidates);
      await target.delete(priceObservations);
      await target.delete(collectionRuns);
      await target.delete(sources);
      await target.delete(plans);
      await target.delete(products);
      await target.delete(providers);
      await target.delete(fxRates);

      for (const batch of batches(providerRows)) {
        await target
          .insert(providers)
          .values(batch)
          .onConflictDoUpdate({
            target: providers.id,
            set: {
              slug: excluded("slug"),
              name: excluded("name"),
              rank: excluded("rank"),
              color: excluded("color"),
              createdAt: excluded("created_at"),
              updatedAt: excluded("updated_at"),
            },
          });
      }

      for (const batch of batches(productRows)) {
        await target
          .insert(products)
          .values(batch)
          .onConflictDoUpdate({
            target: products.id,
            set: {
              providerId: excluded("provider_id"),
              slug: excluded("slug"),
              name: excluded("name"),
              mode: excluded("mode"),
              appStoreId: excluded("app_store_id"),
              enabled: excluded("enabled"),
              metadata: excluded("metadata"),
              createdAt: excluded("created_at"),
              updatedAt: excluded("updated_at"),
            },
          });
      }

      for (const batch of batches(planRows)) {
        await target
          .insert(plans)
          .values(batch)
          .onConflictDoUpdate({
            target: plans.id,
            set: {
              productId: excluded("product_id"),
              canonicalSlug: excluded("canonical_slug"),
              name: excluded("name"),
              billingPeriod: excluded("billing_period"),
              unit: excluded("unit"),
              active: excluded("active"),
              mappingConfidence: excluded("mapping_confidence"),
              metadata: excluded("metadata"),
              createdAt: excluded("created_at"),
              updatedAt: excluded("updated_at"),
            },
          });
      }

      for (const batch of batches(sourceRows)) {
        await target
          .insert(sources)
          .values(batch)
          .onConflictDoUpdate({
            target: sources.id,
            set: {
              productId: excluded("product_id"),
              slug: excluded("slug"),
              type: excluded("type"),
              url: excluded("url"),
              parserVersion: excluded("parser_version"),
              enabled: excluded("enabled"),
              consecutiveFailures: excluded("consecutive_failures"),
              lastAttemptAt: excluded("last_attempt_at"),
              lastSuccessAt: excluded("last_success_at"),
              lastContentHash: excluded("last_content_hash"),
              lastOfferCount: excluded("last_offer_count"),
              createdAt: excluded("created_at"),
              updatedAt: excluded("updated_at"),
            },
          });
      }

      for (const batch of batches(collectionRunRows)) {
        await target
          .insert(collectionRuns)
          .values(batch)
          .onConflictDoUpdate({
            target: collectionRuns.id,
            set: {
              status: excluded("status"),
              trigger: excluded("trigger"),
              startedAt: excluded("started_at"),
              finishedAt: excluded("finished_at"),
              sourceCount: excluded("source_count"),
              successCount: excluded("success_count"),
              failureCount: excluded("failure_count"),
              metadata: excluded("metadata"),
            },
          });
      }

      for (const batch of batches(fxRateRows)) {
        await target
          .insert(fxRates)
          .values(batch)
          .onConflictDoUpdate({
            target: fxRates.id,
            set: {
              baseCurrency: excluded("base_currency"),
              quoteCurrency: excluded("quote_currency"),
              cnyPerUnit: excluded("cny_per_unit"),
              rateDate: excluded("rate_date"),
              sourceUrl: excluded("source_url"),
              observedAt: excluded("observed_at"),
            },
          });
      }

      for (const batch of batches(observationRows)) {
        await target
          .insert(priceObservations)
          .values(batch)
          .onConflictDoUpdate({
            target: priceObservations.id,
            set: {
              planId: excluded("plan_id"),
              sourceId: excluded("source_id"),
              collectionRunId: excluded("collection_run_id"),
              rawPlanName: excluded("raw_plan_name"),
              region: excluded("region"),
              storefront: excluded("storefront"),
              currency: excluded("currency"),
              amountMinor: excluded("amount_minor"),
              convertedCny: excluded("converted_cny"),
              fxRate: excluded("fx_rate"),
              fxRateObservedAt: excluded("fx_rate_observed_at"),
              displayPrice: excluded("display_price"),
              billingPeriod: excluded("billing_period"),
              unit: excluded("unit"),
              taxIncluded: excluded("tax_included"),
              status: excluded("status"),
              rawHash: excluded("raw_hash"),
              observedAt: excluded("observed_at"),
              lastSeenAt: excluded("last_seen_at"),
            },
          });
      }

      for (const batch of batches(changeCandidateRows)) {
        await target
          .insert(priceChangeCandidates)
          .values(batch)
          .onConflictDoUpdate({
            target: priceChangeCandidates.id,
            set: {
              planId: excluded("plan_id"),
              sourceId: excluded("source_id"),
              storefrontKey: excluded("storefront_key"),
              previousObservationId: excluded("previous_observation_id"),
              fingerprint: excluded("fingerprint"),
              lastCollectionRunId: excluded("last_collection_run_id"),
              firstSeenAt: excluded("first_seen_at"),
              lastSeenAt: excluded("last_seen_at"),
            },
          });
      }

      for (const batch of batches(changeEventRows)) {
        await target
          .insert(priceChangeEvents)
          .values(batch)
          .onConflictDoUpdate({
            target: priceChangeEvents.id,
            set: {
              planId: excluded("plan_id"),
              storefront: excluded("storefront"),
              previousObservationId: excluded("previous_observation_id"),
              currentObservationId: excluded("current_observation_id"),
              changePercent: excluded("change_percent"),
              notifiedAt: excluded("notified_at"),
              createdAt: excluded("created_at"),
            },
          });
      }

      for (const batch of batches(collectionErrorRows)) {
        await target
          .insert(collectionErrors)
          .values(batch)
          .onConflictDoUpdate({
            target: collectionErrors.id,
            set: {
              sourceId: excluded("source_id"),
              collectionRunId: excluded("collection_run_id"),
              code: excluded("code"),
              message: excluded("message"),
              details: excluded("details"),
              alertSentAt: excluded("alert_sent_at"),
              resolvedAt: excluded("resolved_at"),
              createdAt: excluded("created_at"),
            },
          });
      }
    });
  } finally {
    await targetConnection.client.end({ timeout: 5 });
  }

  return {
    providers: providerRows.length,
    products: productRows.length,
    plans: planRows.length,
    sources: sourceRows.length,
    collectionRuns: collectionRunRows.length,
    fxRates: fxRateRows.length,
    priceObservations: observationRows.length,
    priceChangeCandidates: changeCandidateRows.length,
    priceChangeEvents: changeEventRows.length,
    collectionErrors: collectionErrorRows.length,
  };
}
