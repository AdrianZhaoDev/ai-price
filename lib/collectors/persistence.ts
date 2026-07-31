import {
  convertMinorToCny,
  fxRateEffectiveAt,
  type FxRate,
} from "@/lib/collectors/fx";
import type {
  NormalizedOffer,
  PriceSourceAdapter,
} from "@/lib/collectors/types";
import {
  decidePriceSample,
  offerPlanSlug,
  priceFingerprint,
  type StoredPriceCandidate,
} from "@/lib/collectors/offer-stability";
import { providerCatalog } from "@/lib/data/catalog";
import { getDatabase } from "@/lib/db/client";
import {
  collectionErrors,
  collectionRuns,
  plans,
  priceChangeCandidates,
  priceChangeEvents,
  priceObservations,
  products,
  providers,
  sources,
} from "@/lib/db/schema";
import { and, desc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";

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
  const slug = offerPlanSlug(offer);
  const metadata = {
    ...(offer.modelName ? { modelName: offer.modelName } : {}),
    ...(offer.modelSlug ? { modelSlug: offer.modelSlug } : {}),
    ...(offer.modelOrder !== undefined ? { modelOrder: offer.modelOrder } : {}),
    ...(offer.priceType ? { priceType: offer.priceType } : {}),
    ...(offer.priceTier ? { priceTier: offer.priceTier } : {}),
    ...(offer.tierOrder !== undefined ? { tierOrder: offer.tierOrder } : {}),
    ...(offer.category ? { category: offer.category } : {}),
    ...(offer.rankingEligible !== undefined
      ? { rankingEligible: offer.rankingEligible }
      : {}),
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
  const activePlanIds = new Set<string>();

  for (const offer of input.offers) {
    const plan = await ensurePlan(input.source.productId, offer);
    activePlanSlugs.add(plan.slug);
    activePlanIds.add(plan.id);
    const fxRate = input.fxRates.get(offer.currency.toUpperCase());
    const fxRateEffectiveDate = fxRateEffectiveAt(fxRate);
    const convertedCny = convertMinorToCny(
      offer.amountMinor,
      offer.currency,
      fxRate,
    );
    const storefrontKey = offer.storefront ?? "";
    const currentFingerprint = priceFingerprint(offer);
    const observedAt = new Date(offer.observedAt);
    const change = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`price:${input.source.id}:${plan.id}:${storefrontKey}`}))`,
      );
      const storefrontCondition = offer.storefront
        ? eq(priceObservations.storefront, offer.storefront)
        : isNull(priceObservations.storefront);
      const [previous] = await tx
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
      const candidateCondition = and(
        eq(priceChangeCandidates.planId, plan.id),
        eq(priceChangeCandidates.sourceId, input.source.id),
        eq(priceChangeCandidates.storefrontKey, storefrontKey),
      );
      const [candidateRow] = await tx
        .select()
        .from(priceChangeCandidates)
        .where(candidateCondition)
        .limit(1);

      const insertObservation = async () => {
        const [current] = await tx
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
            fxRateObservedAt: fxRateEffectiveDate,
            displayPrice: offer.displayPrice,
            billingPeriod: offer.billingPeriod,
            unit: offer.unit,
            taxIncluded: offer.taxIncluded,
            status: offer.status,
            rawHash: currentFingerprint,
            observedAt,
            lastSeenAt: observedAt,
          })
          .returning({ id: priceObservations.id });
        return current;
      };

      if (!previous) {
        await tx.delete(priceChangeCandidates).where(candidateCondition);
        await insertObservation();
        return null;
      }

      const baselineFingerprint = priceFingerprint({
        amountMinor: previous.amountMinor,
        currency: previous.currency,
        billingPeriod: previous.billingPeriod,
        unit: previous.unit,
        taxIncluded: previous.taxIncluded,
      });
      const candidate: StoredPriceCandidate | undefined =
        candidateRow?.lastCollectionRunId
          ? {
              fingerprint: candidateRow.fingerprint,
              previousObservationId: candidateRow.previousObservationId,
              lastCollectionRunId: candidateRow.lastCollectionRunId,
            }
          : undefined;
      const decision = decidePriceSample({
        baselineFingerprint,
        baselineObservationId: previous.id,
        currentFingerprint,
        currentRunId: input.runId,
        candidate,
      });

      if (decision === "unchanged") {
        await tx.delete(priceChangeCandidates).where(candidateCondition);
        await tx
          .update(priceObservations)
          .set({
            lastSeenAt: observedAt,
            status: offer.status,
            convertedCny,
            fxRate: fxRate?.cnyPerUnit,
            fxRateObservedAt: fxRateEffectiveDate,
          })
          .where(eq(priceObservations.id, previous.id));
        const [pendingEvent] = await tx
          .select()
          .from(priceChangeEvents)
          .where(
            and(
              eq(priceChangeEvents.currentObservationId, previous.id),
              isNull(priceChangeEvents.notifiedAt),
            ),
          )
          .limit(1);
        if (!pendingEvent?.previousObservationId) return null;
        const [oldObservation] = await tx
          .select({
            displayPrice: priceObservations.displayPrice,
            convertedCny: priceObservations.convertedCny,
          })
          .from(priceObservations)
          .where(eq(priceObservations.id, pendingEvent.previousObservationId))
          .limit(1);
        if (!oldObservation) return null;
        return {
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
        } satisfies PriceChange;
      }

      if (decision === "stage") {
        await tx
          .insert(priceChangeCandidates)
          .values({
            planId: plan.id,
            sourceId: input.source.id,
            storefrontKey,
            previousObservationId: previous.id,
            fingerprint: currentFingerprint,
            lastCollectionRunId: input.runId,
            firstSeenAt: observedAt,
            lastSeenAt: observedAt,
          })
          .onConflictDoUpdate({
            target: [
              priceChangeCandidates.planId,
              priceChangeCandidates.sourceId,
              priceChangeCandidates.storefrontKey,
            ],
            set: {
              previousObservationId: previous.id,
              fingerprint: currentFingerprint,
              lastCollectionRunId: input.runId,
              firstSeenAt: observedAt,
              lastSeenAt: observedAt,
            },
          });
        return null;
      }

      if (decision === "hold") {
        await tx
          .update(priceChangeCandidates)
          .set({ lastSeenAt: observedAt })
          .where(candidateCondition);
        return null;
      }

      const current = await insertObservation();
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
      const [event] = await tx
        .insert(priceChangeEvents)
        .values({
          planId: plan.id,
          storefront: offer.storefront,
          previousObservationId: previous.id,
          currentObservationId: current.id,
          changePercent,
        })
        .returning({ id: priceChangeEvents.id });
      await tx.delete(priceChangeCandidates).where(candidateCondition);
      return {
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
      } satisfies PriceChange;
    });
    if (change) changes.push(change);
  }

  if (activePlanIds.size > 0) {
    await db
      .delete(priceChangeCandidates)
      .where(
        and(
          eq(priceChangeCandidates.sourceId, input.source.id),
          notInArray(priceChangeCandidates.planId, [...activePlanIds]),
        ),
      );
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

  const resolvedAt = new Date();
  await db
    .update(sources)
    .set({
      consecutiveFailures: 0,
      lastSuccessAt: resolvedAt,
      lastContentHash: input.contentHash,
      lastOfferCount: input.offers.length,
      updatedAt: new Date(),
    })
    .where(eq(sources.id, input.source.id));
  await db
    .update(collectionErrors)
    .set({ resolvedAt })
    .where(
      and(
        eq(collectionErrors.sourceId, input.source.id),
        isNull(collectionErrors.resolvedAt),
      ),
    );

  return changes;
}

export async function recordCollectionFailure(input: {
  runId: string;
  sourceId: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): Promise<{
  errorId: string;
  consecutiveFailures: number;
  shouldAlert: boolean;
}> {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`collector:${input.sourceId}:${input.code}`}))`,
    );
    const [source] = await tx
      .select({ consecutiveFailures: sources.consecutiveFailures })
      .from(sources)
      .where(eq(sources.id, input.sourceId))
      .limit(1);
    const [alertedIncident] = await tx
      .select({ id: collectionErrors.id })
      .from(collectionErrors)
      .where(
        and(
          eq(collectionErrors.sourceId, input.sourceId),
          eq(collectionErrors.code, input.code),
          isNull(collectionErrors.resolvedAt),
          isNotNull(collectionErrors.alertSentAt),
        ),
      )
      .limit(1);
    const consecutiveFailures = (source?.consecutiveFailures ?? 0) + 1;
    const shouldAlert =
      consecutiveFailures >= 3 && alertedIncident === undefined;
    const alertClaimedAt = shouldAlert ? new Date() : null;

    await tx
      .update(sources)
      .set({ consecutiveFailures, updatedAt: new Date() })
      .where(eq(sources.id, input.sourceId));
    const [error] = await tx
      .insert(collectionErrors)
      .values({
        sourceId: input.sourceId,
        collectionRunId: input.runId,
        code: input.code,
        message: input.message,
        details: input.details ?? {},
        alertSentAt: alertClaimedAt,
      })
      .returning({ id: collectionErrors.id });
    return {
      errorId: error.id,
      consecutiveFailures,
      shouldAlert,
    };
  });
}

export async function markCollectionAlertSent(errorId: string): Promise<void> {
  await getDatabase()
    .update(collectionErrors)
    .set({ alertSentAt: new Date() })
    .where(eq(collectionErrors.id, errorId));
}

export async function markCollectionAlertFailed(
  errorId: string,
): Promise<void> {
  await getDatabase()
    .update(collectionErrors)
    .set({ alertSentAt: null })
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
