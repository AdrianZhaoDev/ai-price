import { hashContent } from "@/lib/collectors/http-client";
import { convertMinorToCny, type FxRate } from "@/lib/collectors/fx";
import type {
  NormalizedOffer,
  PriceSourceAdapter,
} from "@/lib/collectors/types";
import { providerCatalog } from "@/lib/data/catalog";
import { getDatabase } from "@/lib/db/client";
import {
  collectionErrors,
  collectionRuns,
  plans,
  priceChangeEvents,
  priceObservations,
  products,
  providers,
  sources,
} from "@/lib/db/schema";
import { and, desc, eq, isNull, notInArray } from "drizzle-orm";

export type SourceReference = {
  id: string;
  productId: string;
  lastOfferCount: number | null;
};

export type PriceChange = {
  eventId: string;
  planId: string;
  previousObservationId: string;
  currentObservationId: string;
  providerSlug: string;
  planSlug: string;
  planName: string;
  region: string;
  previousPrice: string;
  currentPrice: string;
  previousCny: number | null;
  currentCny: number | null;
  sourceUrl: string;
  changePercent: number | null;
};

export type RankedPrice = {
  rank: number;
  observationId: string;
  region: string;
  storefront: string | null;
  displayPrice: string;
  convertedCny: number;
  sourceUrl: string;
};

export type PriceChangeDigest = {
  runId: string;
  eventIds: string[];
  providerSlug: string;
  planSlug: string;
  planName: string;
  changes: PriceChange[];
  topThree: RankedPrice[];
};

function databaseMode(mode: (typeof providerCatalog)[number]["mode"]) {
  return mode === "china-subscription" ? "china_subscription" : mode;
}

export async function startCollectionRun(
  trigger: string,
  sourceCount: number,
): Promise<string> {
  const [run] = await getDatabase()
    .insert(collectionRuns)
    .values({ trigger, sourceCount })
    .returning({ id: collectionRuns.id });
  return run.id;
}

export async function ensureSource(
  adapter: PriceSourceAdapter,
): Promise<SourceReference> {
  const catalogItem = providerCatalog.find(
    (item) => item.id === adapter.providerSlug,
  );
  if (!catalogItem) {
    throw new Error(
      `Collector provider is not in catalog: ${adapter.providerSlug}`,
    );
  }

  return getDatabase().transaction(async (tx) => {
    const [provider] = await tx
      .insert(providers)
      .values({
        slug: catalogItem.id,
        name: catalogItem.name,
        rank: catalogItem.rank,
        color: catalogItem.color,
      })
      .onConflictDoUpdate({
        target: providers.slug,
        set: {
          name: catalogItem.name,
          rank: catalogItem.rank,
          color: catalogItem.color,
          updatedAt: new Date(),
        },
      })
      .returning({ id: providers.id });

    const [product] = await tx
      .insert(products)
      .values({
        providerId: provider.id,
        slug: catalogItem.id,
        name: catalogItem.name,
        mode: databaseMode(catalogItem.mode),
        appStoreId: catalogItem.appStoreId,
      })
      .onConflictDoUpdate({
        target: [products.providerId, products.slug],
        set: {
          name: catalogItem.name,
          mode: databaseMode(catalogItem.mode),
          appStoreId: catalogItem.appStoreId,
          enabled: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: products.id });

    const [existingSource] = await tx
      .select({ parserVersion: sources.parserVersion })
      .from(sources)
      .where(
        and(eq(sources.productId, product.id), eq(sources.slug, adapter.id)),
      )
      .limit(1);
    const parserVersionChanged =
      existingSource !== undefined &&
      existingSource.parserVersion !== adapter.parserVersion;

    const [source] = await tx
      .insert(sources)
      .values({
        productId: product.id,
        slug: adapter.id,
        type:
          catalogItem.sourceType === "official_api"
            ? "official_api"
            : catalogItem.sourceType,
        url: adapter.sourceUrl,
        parserVersion: adapter.parserVersion,
      })
      .onConflictDoUpdate({
        target: [sources.productId, sources.slug],
        set: {
          url: adapter.sourceUrl,
          parserVersion: adapter.parserVersion,
          enabled: true,
          ...(parserVersionChanged ? { lastOfferCount: null } : {}),
          updatedAt: new Date(),
        },
      })
      .returning({
        id: sources.id,
        productId: sources.productId,
        lastOfferCount: sources.lastOfferCount,
      });

    return source;
  });
}

export async function markSourceAttempt(sourceId: string): Promise<void> {
  await getDatabase()
    .update(sources)
    .set({ lastAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(sources.id, sourceId));
}

async function ensurePlan(
  productId: string,
  offer: NormalizedOffer,
): Promise<{ id: string; slug: string }> {
  const slug =
    offer.canonicalPlanSlug ??
    `${offer.providerSlug}-${hashContent(offer.rawPlanName).slice(0, 12)}`;
  const metadata = {
    ...(offer.modelName ? { modelName: offer.modelName } : {}),
    ...(offer.modelSlug ? { modelSlug: offer.modelSlug } : {}),
    ...(offer.modelOrder !== undefined ? { modelOrder: offer.modelOrder } : {}),
    ...(offer.priceType ? { priceType: offer.priceType } : {}),
    ...(offer.priceTier ? { priceTier: offer.priceTier } : {}),
    ...(offer.tierOrder !== undefined ? { tierOrder: offer.tierOrder } : {}),
    ...(offer.category ? { category: offer.category } : {}),
  };
  const [plan] = await getDatabase()
    .insert(plans)
    .values({
      productId,
      canonicalSlug: slug,
      name: offer.rawPlanName,
      billingPeriod: offer.billingPeriod,
      unit: offer.unit,
      mappingConfidence: offer.canonicalPlanSlug ? 100 : 50,
      metadata,
    })
    .onConflictDoUpdate({
      target: [plans.productId, plans.canonicalSlug],
      set: {
        name: offer.rawPlanName,
        billingPeriod: offer.billingPeriod,
        unit: offer.unit,
        metadata,
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning({ id: plans.id, slug: plans.canonicalSlug });
  return plan;
}

export async function recordSuccessfulCollection(input: {
  runId: string;
  source: SourceReference;
  contentHash: string;
  offers: NormalizedOffer[];
  fxRates: Map<string, FxRate>;
}): Promise<PriceChange[]> {
  const db = getDatabase();
  const changes: PriceChange[] = [];
  const activePlanSlugs = new Set<string>();

  for (const offer of input.offers) {
    const plan = await ensurePlan(input.source.productId, offer);
    activePlanSlugs.add(plan.slug);
    const fxRate = input.fxRates.get(offer.currency.toUpperCase());
    const convertedCny = convertMinorToCny(
      offer.amountMinor,
      offer.currency,
      fxRate,
    );
    const storefrontCondition = offer.storefront
      ? eq(priceObservations.storefront, offer.storefront)
      : isNull(priceObservations.storefront);
    const [previous] = await db
      .select()
      .from(priceObservations)
      .where(
        and(
          eq(priceObservations.planId, plan.id),
          eq(priceObservations.sourceId, input.source.id),
          storefrontCondition,
        ),
      )
      .orderBy(desc(priceObservations.observedAt))
      .limit(1);
    const unchanged =
      previous &&
      previous.amountMinor === offer.amountMinor &&
      previous.currency === offer.currency &&
      previous.billingPeriod === offer.billingPeriod;

    if (unchanged) {
      await db
        .update(priceObservations)
        .set({
          lastSeenAt: new Date(offer.observedAt),
          status: "verified",
          convertedCny,
          fxRate: fxRate?.cnyPerUnit,
          fxRateObservedAt: fxRate?.observedAt,
        })
        .where(eq(priceObservations.id, previous.id));
      const [pendingEvent] = await db
        .select()
        .from(priceChangeEvents)
        .where(
          and(
            eq(priceChangeEvents.currentObservationId, previous.id),
            isNull(priceChangeEvents.notifiedAt),
          ),
        )
        .limit(1);
      if (pendingEvent?.previousObservationId) {
        const [oldObservation] = await db
          .select({
            displayPrice: priceObservations.displayPrice,
            convertedCny: priceObservations.convertedCny,
          })
          .from(priceObservations)
          .where(eq(priceObservations.id, pendingEvent.previousObservationId))
          .limit(1);
        if (oldObservation) {
          changes.push({
            eventId: pendingEvent.id,
            planId: plan.id,
            previousObservationId: pendingEvent.previousObservationId,
            currentObservationId: previous.id,
            providerSlug: offer.providerSlug,
            planSlug: plan.slug,
            planName: offer.rawPlanName,
            region: offer.region ?? offer.storefront ?? "官方价格",
            previousPrice: oldObservation.displayPrice,
            currentPrice: offer.displayPrice,
            previousCny: oldObservation.convertedCny,
            currentCny: convertedCny,
            sourceUrl: offer.sourceUrl,
            changePercent: pendingEvent.changePercent,
          });
        }
      }
      continue;
    }

    const rawHash = hashContent(
      JSON.stringify({
        plan: plan.slug,
        storefront: offer.storefront,
        currency: offer.currency,
        amountMinor: offer.amountMinor,
        billingPeriod: offer.billingPeriod,
      }),
    );
    const [current] = await db
      .insert(priceObservations)
      .values({
        planId: plan.id,
        sourceId: input.source.id,
        collectionRunId: input.runId,
        rawPlanName: offer.rawPlanName,
        region: offer.region,
        storefront: offer.storefront,
        currency: offer.currency,
        amountMinor: offer.amountMinor,
        convertedCny,
        fxRate: fxRate?.cnyPerUnit,
        fxRateObservedAt: fxRate?.observedAt,
        displayPrice: offer.displayPrice,
        billingPeriod: offer.billingPeriod,
        unit: offer.unit,
        taxIncluded: offer.taxIncluded,
        status: offer.status,
        rawHash,
        observedAt: new Date(offer.observedAt),
        lastSeenAt: new Date(offer.observedAt),
      })
      .returning({ id: priceObservations.id });

    if (previous) {
      const changePercent =
        previous.amountMinor === null ||
        offer.amountMinor === null ||
        previous.amountMinor === 0
          ? null
          : Math.round(
              ((offer.amountMinor - previous.amountMinor) /
                previous.amountMinor) *
                100,
            );
      const [event] = await db
        .insert(priceChangeEvents)
        .values({
          planId: plan.id,
          storefront: offer.storefront,
          previousObservationId: previous.id,
          currentObservationId: current.id,
          changePercent,
        })
        .returning({ id: priceChangeEvents.id });
      changes.push({
        eventId: event.id,
        planId: plan.id,
        previousObservationId: previous.id,
        currentObservationId: current.id,
        providerSlug: offer.providerSlug,
        planSlug: plan.slug,
        planName: offer.rawPlanName,
        region: offer.region ?? offer.storefront ?? "官方价格",
        previousPrice: previous.displayPrice,
        currentPrice: offer.displayPrice,
        previousCny: previous.convertedCny,
        currentCny: convertedCny,
        sourceUrl: offer.sourceUrl,
        changePercent,
      });
    }
  }

  if (
    input.offers.length > 0 &&
    input.offers.every((offer) => offer.channel !== "app_store")
  ) {
    await db
      .update(plans)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(plans.productId, input.source.productId),
          notInArray(plans.canonicalSlug, [...activePlanSlugs]),
        ),
      );
  }

  await db
    .update(sources)
    .set({
      consecutiveFailures: 0,
      lastSuccessAt: new Date(),
      lastContentHash: input.contentHash,
      lastOfferCount: input.offers.length,
      updatedAt: new Date(),
    })
    .where(eq(sources.id, input.source.id));

  return changes;
}

export async function recordCollectionFailure(input: {
  runId: string;
  sourceId: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): Promise<{ errorId: string; consecutiveFailures: number }> {
  const db = getDatabase();
  const [source] = await db
    .select({ consecutiveFailures: sources.consecutiveFailures })
    .from(sources)
    .where(eq(sources.id, input.sourceId))
    .limit(1);
  const consecutiveFailures = (source?.consecutiveFailures ?? 0) + 1;

  await db
    .update(sources)
    .set({ consecutiveFailures, updatedAt: new Date() })
    .where(eq(sources.id, input.sourceId));
  const [error] = await db
    .insert(collectionErrors)
    .values({
      sourceId: input.sourceId,
      collectionRunId: input.runId,
      code: input.code,
      message: input.message,
      details: input.details ?? {},
    })
    .returning({ id: collectionErrors.id });
  return { errorId: error.id, consecutiveFailures };
}

export async function markCollectionAlertSent(errorId: string): Promise<void> {
  await getDatabase()
    .update(collectionErrors)
    .set({ alertSentAt: new Date() })
    .where(eq(collectionErrors.id, errorId));
}

export async function markPriceChangeNotified(eventId: string): Promise<void> {
  await getDatabase()
    .update(priceChangeEvents)
    .set({ notifiedAt: new Date() })
    .where(eq(priceChangeEvents.id, eventId));
}

export async function markPriceChangesNotified(
  eventIds: string[],
): Promise<void> {
  for (const eventId of eventIds) {
    await markPriceChangeNotified(eventId);
  }
}

function latestByPriceIdentity<
  T extends {
    sourceId: string;
    storefront: string | null;
  },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const identity = `${row.sourceId}:${row.storefront ?? "default"}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export async function buildPriceChangeDigests(
  runId: string,
  changes: PriceChange[],
): Promise<{ digests: PriceChangeDigest[]; ignoredEventIds: string[] }> {
  const grouped = new Map<string, PriceChange[]>();
  for (const change of changes) {
    const group = grouped.get(change.planId) ?? [];
    group.push(change);
    grouped.set(change.planId, group);
  }

  const digests: PriceChangeDigest[] = [];
  const ignoredEventIds: string[] = [];
  for (const [planId, planChanges] of grouped) {
    const rows = await getDatabase()
      .select({
        id: priceObservations.id,
        sourceId: priceObservations.sourceId,
        collectionRunId: priceObservations.collectionRunId,
        storefront: priceObservations.storefront,
        region: priceObservations.region,
        displayPrice: priceObservations.displayPrice,
        convertedCny: priceObservations.convertedCny,
        status: priceObservations.status,
        observedAt: priceObservations.observedAt,
        sourceUrl: sources.url,
      })
      .from(priceObservations)
      .innerJoin(sources, eq(sources.id, priceObservations.sourceId))
      .where(eq(priceObservations.planId, planId))
      .orderBy(desc(priceObservations.observedAt));

    const comparable = rows.filter(
      (
        row,
      ): row is typeof row & {
        convertedCny: number;
      } =>
        row.status === "verified" &&
        row.convertedCny !== null &&
        Number.isFinite(row.convertedCny),
    );
    const current = latestByPriceIdentity(comparable);
    const previous = latestByPriceIdentity(
      comparable.filter((row) => row.collectionRunId !== runId),
    );
    const currentTop = current
      .sort((a, b) => a.convertedCny - b.convertedCny)
      .slice(0, 3);
    const previousTopIds = new Set(
      previous
        .sort((a, b) => a.convertedCny - b.convertedCny)
        .slice(0, 3)
        .map((row) => row.id),
    );
    const currentTopIds = new Set(currentTop.map((row) => row.id));
    const relevant = planChanges.filter(
      (change) =>
        currentTopIds.has(change.currentObservationId) ||
        previousTopIds.has(change.previousObservationId),
    );
    const ignored = planChanges.filter((change) => !relevant.includes(change));
    ignoredEventIds.push(...ignored.map((change) => change.eventId));
    if (relevant.length === 0) continue;

    const first = relevant[0];
    digests.push({
      runId,
      eventIds: relevant.map((change) => change.eventId),
      providerSlug: first.providerSlug,
      planSlug: first.planSlug,
      planName: first.planName,
      changes: relevant,
      topThree: currentTop.map((row, index) => ({
        rank: index + 1,
        observationId: row.id,
        region: row.region ?? row.storefront ?? "官方价格",
        storefront: row.storefront,
        displayPrice: row.displayPrice,
        convertedCny: row.convertedCny,
        sourceUrl: row.sourceUrl,
      })),
    });
  }
  return { digests, ignoredEventIds };
}

export async function finishCollectionRun(input: {
  runId: string;
  successCount: number;
  failureCount: number;
}): Promise<void> {
  await getDatabase()
    .update(collectionRuns)
    .set({
      status:
        input.failureCount === 0
          ? "success"
          : input.successCount === 0
            ? "failed"
            : "partial",
      successCount: input.successCount,
      failureCount: input.failureCount,
      finishedAt: new Date(),
    })
    .where(eq(collectionRuns.id, input.runId));
}
