import {
  contentHash,
  channelSnapshotSchema,
  transitSnapshotSchema,
  transitPositiveDecimalSchema,
  type ChannelSnapshot,
  type TransitSnapshot,
} from "@/lib/public-data/snapshot";
import { getPublicDataDatabase } from "@/lib/db/client";
import {
  channelMerchants,
  channelOfferObservations,
  channelProducts,
  channelPublicOffers,
  publicDataGenerations,
  transitAvailabilitySamples,
  transitOffers,
  transitStations,
} from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgTable, PgInsertValue } from "drizzle-orm/pg-core";
import { calculateRechargeCoefficient } from "@/lib/transit/ranking";
import { isTransitStationPublic } from "@/lib/transit/types";

export type PublicPublishResult = {
  domain: "channels" | "transit";
  generationId: string;
  generatedAt: string;
  recordCount: number;
  sourceCount: number;
  contentHash: string;
  published: boolean;
};

function assertFreshGeneration(generatedAt: string) {
  if (Date.now() - Date.parse(generatedAt) > 36 * 60 * 60 * 1000)
    throw new Error(
      "Snapshot generation is stale; previous published generation retained.",
    );
}

function countCollapsed(previous: number, incoming: number): boolean {
  return (
    (previous > 0 && incoming === 0) ||
    (previous - incoming >= 2 && incoming < previous * 0.7)
  );
}

function assertStablePrice(
  previous: number | null | undefined,
  incoming: number | null | undefined,
) {
  if (previous == null) return; // First observed price has no comparable baseline.
  if (
    incoming == null ||
    Math.abs(incoming - previous) > Math.abs(previous) * (0.5 + 1e-9)
  )
    throw new Error(
      "Price anomaly exceeds the 50% change limit; previous snapshot retained for review.",
    );
}

type OfferIdentity = { id: string; source: string; key: string };
function matchOfferIdentities(
  previous: OfferIdentity[],
  incoming: OfferIdentity[],
): Map<string, string> {
  const byId = new Map(previous.map((row) => [row.id, row]));
  const byKey = new Map<string, OfferIdentity | null>();
  const sourceCounts = new Map<string, number>();
  for (const row of previous) {
    const key = JSON.stringify([row.source, row.key]);
    byKey.set(key, byKey.has(key) ? null : row);
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
  }
  const matches = new Map<string, string>();
  const retained = new Map<string, Set<string>>();
  for (const row of incoming) {
    const prior =
      byId.get(row.id) ?? byKey.get(JSON.stringify([row.source, row.key]));
    if (!prior) continue;
    if (prior.source !== row.source)
      throw new Error(
        "Offer source identity changed; previous snapshot retained for review.",
      );
    matches.set(row.id, prior.id);
    const ids = retained.get(row.source) ?? new Set<string>();
    ids.add(prior.id);
    retained.set(row.source, ids);
  }
  for (const [source, count] of sourceCounts)
    if (countCollapsed(count, retained.get(source)?.size ?? 0))
      throw new Error(
        "Offer identity overlap collapsed; previous snapshot retained for review.",
      );
  return matches;
}

type PublishTransaction = Parameters<
  Parameters<ReturnType<typeof getPublicDataDatabase>["transaction"]>[0]
>[0];

async function insertRows<T extends PgTable>(
  tx: PublishTransaction,
  table: T,
  rows: PgInsertValue<T>[],
): Promise<void> {
  // PostgreSQL has a per-statement parameter limit; feeds can exceed it.
  for (let offset = 0; offset < rows.length; offset += 500) {
    await tx.insert(table).values(rows.slice(offset, offset + 500));
  }
}

function searchText(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLocaleLowerCase("en-US")
    .slice(0, 20_000);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function existingGeneration(
  tx: Parameters<
    Parameters<ReturnType<typeof getPublicDataDatabase>["transaction"]>[0]
  >[0],
  domain: "channels" | "transit",
  hash: string,
  generatedAt: string,
) {
  // Coordinate CLI/manual publishers as well as scheduled workflow runs.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`public-data:${domain}`}))`,
  );
  const [current] = await tx
    .select({ generatedAt: publicDataGenerations.generatedAt })
    .from(publicDataGenerations)
    .where(
      and(
        eq(publicDataGenerations.domain, domain),
        eq(publicDataGenerations.status, "published"),
      ),
    )
    .orderBy(desc(publicDataGenerations.publishedAt))
    .limit(1);
  if (current && Date.parse(generatedAt) < current.generatedAt.getTime())
    throw new Error(
      "Snapshot is older than the published generation; current data retained.",
    );
  const [row] = await tx
    .select()
    .from(publicDataGenerations)
    .where(
      and(
        eq(publicDataGenerations.domain, domain),
        eq(publicDataGenerations.contentHash, hash),
      ),
    )
    .orderBy(desc(publicDataGenerations.createdAt))
    .limit(1);
  return row;
}

async function isCurrentGeneration(
  tx: Parameters<
    Parameters<ReturnType<typeof getPublicDataDatabase>["transaction"]>[0]
  >[0],
  domain: "channels" | "transit",
  id: string,
): Promise<boolean> {
  const [latest] = await tx
    .select({ id: publicDataGenerations.id })
    .from(publicDataGenerations)
    .where(
      and(
        eq(publicDataGenerations.domain, domain),
        eq(publicDataGenerations.status, "published"),
      ),
    )
    .orderBy(desc(publicDataGenerations.publishedAt))
    .limit(1);
  return latest?.id === id;
}

async function insertGeneration(
  tx: Parameters<
    Parameters<ReturnType<typeof getPublicDataDatabase>["transaction"]>[0]
  >[0],
  domain: "channels" | "transit",
  snapshot: ChannelSnapshot | TransitSnapshot,
  hash: string,
) {
  const [generation] = await tx
    .insert(publicDataGenerations)
    .values({
      domain,
      status: "building",
      sourceCount: snapshot.sourceCount,
      recordCount:
        domain === "channels"
          ? (snapshot as ChannelSnapshot).offers.length
          : (snapshot as TransitSnapshot).stations.length,
      contentHash: hash,
      generatedAt: new Date(snapshot.generatedAt),
    })
    .returning({ id: publicDataGenerations.id });
  return generation.id;
}

async function clearChannelRows(
  tx: Parameters<
    Parameters<ReturnType<typeof getPublicDataDatabase>["transaction"]>[0]
  >[0],
) {
  await tx.delete(channelPublicOffers);
  await tx.delete(channelProducts);
  await tx.delete(channelMerchants);
}

async function clearTransitRows(
  tx: Parameters<
    Parameters<ReturnType<typeof getPublicDataDatabase>["transaction"]>[0]
  >[0],
) {
  await tx.delete(transitAvailabilitySamples);
  await tx.delete(transitOffers);
  await tx.delete(transitStations);
}

export async function publishChannelSnapshot(
  snapshot: ChannelSnapshot,
): Promise<PublicPublishResult> {
  snapshot = channelSnapshotSchema.parse(snapshot);
  assertFreshGeneration(snapshot.generatedAt);
  // An empty feed is almost always an upstream outage or parser regression.
  // Reject before opening a transaction so the last published generation and
  // its rows remain available to the web reader.
  if (
    snapshot.offers.length === 0 ||
    snapshot.merchants.length === 0 ||
    snapshot.products.length === 0
  ) {
    throw new Error(
      "Channel snapshot is empty; previous published generation retained.",
    );
  }
  const activeMerchants = new Set(
    snapshot.merchants
      .filter((merchant) => merchant.status === "active")
      .map((merchant) => merchant.id),
  );
  if (
    !snapshot.offers.some(
      (offer) =>
        offer.status === "verified" && activeMerchants.has(offer.merchantId),
    )
  ) {
    throw new Error(
      "Channel snapshot has no public offers; previous published generation retained.",
    );
  }
  const hash = contentHash(snapshot);
  const database = getPublicDataDatabase();
  return database.transaction(async (tx) => {
    const previous = await existingGeneration(
      tx,
      "channels",
      hash,
      snapshot.generatedAt,
    );
    if (
      previous?.status === "published" &&
      (await isCurrentGeneration(tx, "channels", previous.id))
    ) {
      return {
        domain: "channels",
        generationId: previous.id,
        generatedAt: snapshot.generatedAt,
        recordCount: snapshot.offers.length,
        sourceCount: snapshot.sourceCount,
        contentHash: hash,
        published: false,
      };
    }

    const generationId =
      previous?.id ?? (await insertGeneration(tx, "channels", snapshot, hash));
    if (previous) {
      await tx
        .update(publicDataGenerations)
        .set({
          status: "building",
          sourceCount: snapshot.sourceCount,
          recordCount: snapshot.offers.length,
          generatedAt: new Date(snapshot.generatedAt),
          publishedAt: null,
          error: null,
        })
        .where(eq(publicDataGenerations.id, generationId));
    }

    const merchantIds = new Set(
      snapshot.merchants.map((merchant) => merchant.id),
    );
    const productIds = new Set(snapshot.products.map((product) => product.id));
    for (const offer of snapshot.offers) {
      if (
        !merchantIds.has(offer.merchantId) ||
        !productIds.has(offer.productId)
      ) {
        throw new Error(
          `Channel offer ${offer.id} references an unknown merchant or product.`,
        );
      }
    }

    const baseline = await tx
      .select({
        merchantId: channelPublicOffers.merchantId,
        totalCount: sql<number>`count(*)::int`,
        count: sql<number>`count(*) filter (where ${channelPublicOffers.status} in ('verified', 'published') and ${channelMerchants.status} = 'active')::int`,
      })
      .from(channelPublicOffers)
      .innerJoin(
        channelMerchants,
        eq(channelPublicOffers.merchantId, channelMerchants.id),
      )
      .groupBy(channelPublicOffers.merchantId);
    const incomingCounts = new Map<string, number>();
    const incomingTotals = new Map<string, number>();
    for (const offer of snapshot.offers) {
      incomingTotals.set(
        offer.merchantId,
        (incomingTotals.get(offer.merchantId) ?? 0) + 1,
      );
      if (offer.status === "verified" && activeMerchants.has(offer.merchantId))
        incomingCounts.set(
          offer.merchantId,
          (incomingCounts.get(offer.merchantId) ?? 0) + 1,
        );
    }
    for (const source of baseline) {
      const nextCount = incomingCounts.get(source.merchantId) ?? 0;
      if (
        !merchantIds.has(source.merchantId) ||
        countCollapsed(source.count, nextCount) ||
        countCollapsed(
          source.totalCount,
          incomingTotals.get(source.merchantId) ?? 0,
        )
      )
        throw new Error(
          "Channel source coverage or offer count collapsed; previous snapshot retained.",
        );
    }
    const previousPrices = new Map(
      (
        await tx
          .select({
            id: channelPublicOffers.id,
            merchantId: channelPublicOffers.merchantId,
            productId: channelPublicOffers.productId,
            offerUrl: channelPublicOffers.offerUrl,
            bulkPricingTiers: channelPublicOffers.bulkPricingTiers,
            priceMinor: channelPublicOffers.priceMinor,
            currency: channelPublicOffers.currency,
          })
          .from(channelPublicOffers)
      ).map((row) => [row.id, row]),
    );
    const identity = (offer: {
      id: string;
      merchantId: string;
      productId: string;
      offerUrl: string;
    }): OfferIdentity => ({
      id: offer.id,
      source: offer.merchantId,
      key: JSON.stringify([offer.productId, offer.offerUrl]),
    });
    const matches = matchOfferIdentities(
      [...previousPrices.values()].map(identity),
      snapshot.offers.map(identity),
    );
    for (const offer of snapshot.offers) {
      const prior = previousPrices.get(matches.get(offer.id) ?? "");
      if (!prior) continue;
      if (prior.priceMinor != null && prior.currency !== offer.currency)
        throw new Error(
          "Channel price currency changed; previous snapshot retained for review.",
        );
      assertStablePrice(prior.priceMinor, offer.priceMinor);
      const oldTiers = new Map(
        prior.bulkPricingTiers.map((tier) => [tier.minQuantity, tier]),
      );
      let matchedTiers = 0;
      for (const tier of offer.bulkPricingTiers) {
        const old = oldTiers.get(tier.minQuantity);
        if (!old) continue;
        matchedTiers++;
        if (old.currency !== tier.currency)
          throw new Error(
            "Bulk price currency changed; previous snapshot retained for review.",
          );
        assertStablePrice(finiteNumber(old.priceMinor), tier.priceMinor);
      }
      if (countCollapsed(oldTiers.size, matchedTiers))
        throw new Error(
          "Bulk tier identity overlap collapsed; previous snapshot retained for review.",
        );
    }
    await clearChannelRows(tx);
    const offerCounts = new Map<
      string,
      { total: number; inStock: number; latest: Date }
    >();
    for (const offer of snapshot.offers) {
      const current = offerCounts.get(offer.productId) ?? {
        total: 0,
        inStock: 0,
        latest: new Date(offer.lastSeenAt),
      };
      current.total += 1;
      if (offer.availability === "in_stock") current.inStock += 1;
      current.latest = new Date(
        Math.max(
          current.latest.getTime(),
          new Date(offer.lastSeenAt).getTime(),
        ),
      );
      offerCounts.set(offer.productId, current);
    }
    const merchantCounts = new Map<
      string,
      { total: number; inStock: number; latest: Date }
    >();
    for (const offer of snapshot.offers) {
      const current = merchantCounts.get(offer.merchantId) ?? {
        total: 0,
        inStock: 0,
        latest: new Date(offer.lastSeenAt),
      };
      current.total += 1;
      if (offer.availability === "in_stock") current.inStock += 1;
      current.latest = new Date(
        Math.max(
          current.latest.getTime(),
          new Date(offer.lastSeenAt).getTime(),
        ),
      );
      merchantCounts.set(offer.merchantId, current);
    }

    if (snapshot.merchants.length) {
      await insertRows(
        tx,
        channelMerchants,
        snapshot.merchants.map((merchant) => {
          const counts = merchantCounts.get(merchant.id);
          return {
            id: merchant.id,
            generationId,
            slug: merchant.slug,
            name: merchant.name,
            host: merchant.host,
            websiteUrl: merchant.websiteUrl,
            status: merchant.status,
            operatorType: merchant.operatorType ?? null,
            platforms: merchant.platforms,
            riskLabels: merchant.riskLabels,
            offerCount: counts?.total ?? 0,
            inStockCount: counts?.inStock ?? 0,
            latestSeenAt: counts?.latest ?? null,
            searchText: searchText([
              merchant.name,
              merchant.host,
              merchant.slug,
              ...merchant.platforms,
              ...merchant.riskLabels,
            ]),
            updatedAt: new Date(snapshot.generatedAt),
          };
        }),
      );
    }
    if (snapshot.products.length) {
      await insertRows(
        tx,
        channelProducts,
        snapshot.products.map((product) => {
          const counts = offerCounts.get(product.id);
          return {
            id: product.id,
            generationId,
            slug: product.slug,
            displayName: product.displayName,
            platform: product.platform,
            productType: product.productType,
            spec: product.spec ?? null,
            summary: product.summary ?? null,
            aliases: product.aliases,
            offerCount: counts?.total ?? 0,
            inStockCount: counts?.inStock ?? 0,
            latestSeenAt: counts?.latest ?? null,
            searchText: searchText([
              product.displayName,
              product.slug,
              product.platform,
              product.productType,
              product.spec,
              product.summary,
              ...product.aliases,
            ]),
            updatedAt: new Date(snapshot.generatedAt),
          };
        }),
      );
    }
    if (snapshot.offers.length) {
      await insertRows(
        tx,
        channelPublicOffers,
        snapshot.offers.map((offer) => ({
          id: offer.id,
          generationId,
          merchantId: offer.merchantId,
          productId: offer.productId,
          sourceName: offer.sourceName,
          sourceType: offer.sourceType,
          sourceUrl: offer.sourceUrl,
          title: offer.title,
          offerUrl: offer.offerUrl,
          priceMinor: offer.priceMinor,
          currency: offer.currency,
          availability: offer.availability,
          stockCount: offer.stockCount ?? null,
          minOrderQuantity: offer.minOrderQuantity ?? null,
          bulkPricingTiers: offer.bulkPricingTiers,
          tags: offer.tags,
          riskLabels: offer.riskLabels,
          status: offer.status,
          observedAt: new Date(offer.observedAt),
          lastSeenAt: new Date(offer.lastSeenAt),
          expiresAt: toDate(offer.expiresAt),
          verifiedAt: toDate(offer.verifiedAt),
          searchText: searchText([
            offer.title,
            offer.sourceName,
            offer.currency,
            ...offer.tags,
            ...offer.riskLabels,
          ]),
          updatedAt: new Date(snapshot.generatedAt),
        })),
      );
      const merchantNames = new Map(
        snapshot.merchants.map((merchant) => [merchant.id, merchant.name]),
      );
      const productNames = new Map(
        snapshot.products.map((product) => [product.id, product.displayName]),
      );
      const observations = snapshot.offers.map((offer) => ({
        offerId: offer.id,
        generationId,
        offerSnapshot: {
          ...offer,
          merchantName: merchantNames.get(offer.merchantId),
          productName: productNames.get(offer.productId),
        },
        priceMinor: offer.priceMinor,
        currency: offer.currency,
        availability: offer.availability,
        stockCount: offer.stockCount ?? null,
        observedAt: new Date(offer.observedAt),
        rawHash: contentHash(offer),
      }));
      for (let offset = 0; offset < observations.length; offset += 500) {
        await tx
          .insert(channelOfferObservations)
          .values(observations.slice(offset, offset + 500))
          .onConflictDoNothing({
            target: [
              channelOfferObservations.offerId,
              channelOfferObservations.observedAt,
              channelOfferObservations.rawHash,
            ],
          });
      }
    }
    await tx
      .update(publicDataGenerations)
      .set({
        status: "published",
        publishedAt: sql`clock_timestamp()`,
        error: null,
      })
      .where(eq(publicDataGenerations.id, generationId));
    return {
      domain: "channels",
      generationId,
      generatedAt: snapshot.generatedAt,
      recordCount: snapshot.offers.length,
      sourceCount: snapshot.sourceCount,
      contentHash: hash,
      published: true,
    };
  });
}

function transitRechargeRatio(
  offer: TransitSnapshot["offers"][number],
): number | null {
  const ratio =
    finiteNumber(offer.rechargeRatio) ??
    calculateRechargeCoefficient(offer.rechargeRatioRaw) ??
    calculateRechargeCoefficient(
      typeof offer.rechargeRatio === "string" ? offer.rechargeRatio : null,
    );
  return ratio === null ? null : transitPositiveDecimalSchema.parse(ratio);
}

function transitCombinedMultiplier(
  offer: TransitSnapshot["offers"][number],
): number | null {
  if (offer.billingMode !== "token") return null;
  if (
    offer.combinedMultiplier !== undefined &&
    offer.combinedMultiplier !== null
  ) {
    return offer.combinedMultiplier;
  }
  const recharge = offer.rechargeCoefficient ?? transitRechargeRatio(offer);
  const model = offer.stationGroupMultiplier ?? offer.modelMultiplier;
  if (
    recharge === undefined ||
    recharge === null ||
    model === undefined ||
    model === null
  )
    return null;
  const combined = recharge * model;
  return transitPositiveDecimalSchema.parse(combined);
}

export async function publishTransitSnapshot(
  snapshot: TransitSnapshot,
): Promise<PublicPublishResult> {
  snapshot = transitSnapshotSchema.parse(snapshot);
  assertFreshGeneration(snapshot.generatedAt);
  for (const offer of snapshot.offers) {
    transitRechargeRatio(offer);
    transitCombinedMultiplier(offer);
  }
  // A directory with no stations is not a valid refresh.  Keep the previous
  // generation instead of clearing all public rows on an upstream outage.
  if (snapshot.stations.length === 0) {
    throw new Error(
      "Transit snapshot is empty; previous published generation retained.",
    );
  }
  if (!snapshot.stations.some((station) => isTransitStationPublic(station))) {
    throw new Error(
      "Transit snapshot has no public stations; previous published generation retained.",
    );
  }
  const hash = contentHash(snapshot);
  const database = getPublicDataDatabase();
  return database.transaction(async (tx) => {
    const previous = await existingGeneration(
      tx,
      "transit",
      hash,
      snapshot.generatedAt,
    );
    if (
      previous?.status === "published" &&
      (await isCurrentGeneration(tx, "transit", previous.id))
    ) {
      return {
        domain: "transit",
        generationId: previous.id,
        generatedAt: snapshot.generatedAt,
        recordCount: snapshot.stations.length,
        sourceCount: snapshot.sourceCount,
        contentHash: hash,
        published: false,
      };
    }
    const generationId =
      previous?.id ?? (await insertGeneration(tx, "transit", snapshot, hash));
    if (previous) {
      await tx
        .update(publicDataGenerations)
        .set({
          status: "building",
          sourceCount: snapshot.sourceCount,
          recordCount: snapshot.stations.length,
          generatedAt: new Date(snapshot.generatedAt),
          publishedAt: null,
          error: null,
        })
        .where(eq(publicDataGenerations.id, generationId));
    }
    const stationIds = new Set(snapshot.stations.map((station) => station.id));
    for (const offer of snapshot.offers) {
      if (!stationIds.has(offer.stationId)) {
        throw new Error(
          `Transit offer ${offer.id} references an unknown station.`,
        );
      }
    }
    const offerIds = new Set(snapshot.offers.map((offer) => offer.id));
    const offerStations = new Map(
      snapshot.offers.map((offer) => [offer.id, offer.stationId]),
    );
    for (const sample of snapshot.availabilitySamples) {
      if (
        !stationIds.has(sample.stationId) ||
        (sample.offerId &&
          (!offerIds.has(sample.offerId) ||
            offerStations.get(sample.offerId) !== sample.stationId))
      ) {
        throw new Error(
          `Transit availability sample ${sample.id} references an unknown station or offer.`,
        );
      }
    }
    // All adapters and imported feeds must retain complete source coverage.
    // Check under the same domain lock/transaction as the replacement.
    const verificationCutoff = new Date(Date.now() - 36 * 3600000);
    const verificationCeiling = new Date(Date.now() + 5 * 60000);
    const baselineRows = await tx
      .select({
        stationId: transitStations.id,
        totalCount: sql<number>`count(${transitOffers.id})::int`,
        count: sql<number>`count(${transitOffers.id}) filter (where ${transitOffers.status} = 'verified' and ${transitOffers.lastVerifiedAt} >= ${verificationCutoff.toISOString()}::timestamptz and ${transitOffers.lastVerifiedAt} <= ${verificationCeiling.toISOString()}::timestamptz and ${transitStations.dataStatus} = 'verified' and ${transitStations.status} <> 'unavailable')::int`,
      })
      .from(transitStations)
      .leftJoin(transitOffers, eq(transitStations.id, transitOffers.stationId))
      .groupBy(transitStations.id);
    const incomingCounts = new Map<string, number>();
    const incomingTotals = new Map<string, number>();
    const publicStationIds = new Set(
      snapshot.stations
        .filter((station) => isTransitStationPublic(station))
        .map((station) => station.id),
    );
    for (const offer of snapshot.offers) {
      incomingTotals.set(
        offer.stationId,
        (incomingTotals.get(offer.stationId) ?? 0) + 1,
      );
      const verifiedAt = offer.lastVerifiedAt
        ? Date.parse(offer.lastVerifiedAt)
        : NaN;
      if (
        offer.status === "verified" &&
        publicStationIds.has(offer.stationId) &&
        verifiedAt >= verificationCutoff.getTime() &&
        verifiedAt <= verificationCeiling.getTime()
      )
        incomingCounts.set(
          offer.stationId,
          (incomingCounts.get(offer.stationId) ?? 0) + 1,
        );
    }
    for (const station of baselineRows) {
      const baseline = station.count;
      const nextCount = incomingCounts.get(station.stationId) ?? 0;
      if (
        !stationIds.has(station.stationId) ||
        countCollapsed(baseline, nextCount) ||
        countCollapsed(
          station.totalCount,
          incomingTotals.get(station.stationId) ?? 0,
        )
      )
        throw new Error(
          "Transit source coverage or model count collapsed; previous snapshot retained.",
        );
    }
    const previousPrices = new Map(
      (
        await tx
          .select({
            id: transitOffers.id,
            stationId: transitOffers.stationId,
            standardModel: transitOffers.standardModel,
            groupName: transitOffers.groupName,
            currency: transitOffers.currency,
            billingMode: transitOffers.billingMode,
            inputPrice: transitOffers.inputPrice,
            outputPrice: transitOffers.outputPrice,
            cacheReadPrice: transitOffers.cacheReadPrice,
            cacheWritePrice: transitOffers.cacheWritePrice,
            imageOutputPrice: transitOffers.imageOutputPrice,
            fixedPrice: transitOffers.fixedPrice,
            fixedPriceCurrency: transitOffers.fixedPriceCurrency,
            fixedPriceUnit: transitOffers.fixedPriceUnit,
            combinedMultiplier: transitOffers.combinedMultiplier,
          })
          .from(transitOffers)
      ).map((row) => [row.id, row]),
    );
    const identity = (offer: {
      id: string;
      stationId: string;
      standardModel: string;
      groupName?: string | null;
      billingMode: string;
    }): OfferIdentity => ({
      id: offer.id,
      source: offer.stationId,
      key: JSON.stringify([
        offer.standardModel,
        offer.groupName ?? null,
        offer.billingMode,
      ]),
    });
    const matches = matchOfferIdentities(
      [...previousPrices.values()].map(identity),
      snapshot.offers.map(identity),
    );
    for (const offer of snapshot.offers) {
      const prior = previousPrices.get(matches.get(offer.id) ?? "");
      if (!prior) continue;
      if (
        prior.currency !== offer.currency ||
        prior.billingMode !== offer.billingMode ||
        (prior.fixedPrice != null &&
          (prior.fixedPriceCurrency !== (offer.fixedPriceCurrency ?? null) ||
            prior.fixedPriceUnit !== (offer.fixedPriceUnit ?? null)))
      )
        throw new Error(
          "Transit price units changed; previous snapshot retained for review.",
        );
      for (const field of [
        "inputPrice",
        "outputPrice",
        "cacheReadPrice",
        "cacheWritePrice",
        "imageOutputPrice",
        "fixedPrice",
      ] as const)
        assertStablePrice(prior[field], offer[field]);
      assertStablePrice(
        prior.combinedMultiplier,
        transitCombinedMultiplier(offer),
      );
    }
    await clearTransitRows(tx);
    const offersByStation = new Map<string, TransitSnapshot["offers"]>();
    for (const offer of snapshot.offers) {
      const list = offersByStation.get(offer.stationId) ?? [];
      list.push(offer);
      offersByStation.set(offer.stationId, list);
    }
    if (snapshot.stations.length) {
      await insertRows(
        tx,
        transitStations,
        snapshot.stations.map((station) => {
          const lowest = offersByStation
            .get(station.id)
            ?.map(transitCombinedMultiplier)
            .filter((value): value is number => value !== null)
            .sort((a, b) => a - b)[0];
          return {
            id: station.id,
            generationId,
            slug: station.slug,
            name: station.name,
            websiteUrl: station.websiteUrl,
            apiBaseUrl: station.apiBaseUrl ?? null,
            status: station.status,
            dataStatus: station.dataStatus,
            stationSystem: station.stationSystem ?? null,
            operatorType: station.operatorType ?? null,
            commercialRelation: station.commercialRelation,
            summary: station.summary ?? null,
            channelTypes: station.channelTypes,
            accountPools: station.accountPools,
            paymentMethods: station.paymentMethods,
            riskLabels: station.riskLabels,
            usageAdvice: Array.isArray(station.usageAdvice)
              ? station.usageAdvice
              : station.usageAdvice
                ? [station.usageAdvice]
                : [],
            sourceType: station.sourceType,
            sourceUrl: station.sourceUrl,
            lowestMultiplier: lowest ?? null,
            currency:
              offersByStation.get(station.id)?.find((offer) => offer.currency)
                ?.currency ?? null,
            lastUpdatedAt: toDate(station.lastUpdatedAt),
            lastCollectedAt: toDate(station.lastCollectedAt),
            payload: station.payload,
            searchText: searchText([
              station.name,
              station.slug,
              station.summary,
              station.stationSystem,
              station.operatorType,
              ...station.channelTypes,
              ...station.accountPools,
              ...station.riskLabels,
            ]),
            updatedAt: new Date(snapshot.generatedAt),
          };
        }),
      );
    }
    if (snapshot.offers.length) {
      await insertRows(
        tx,
        transitOffers,
        snapshot.offers.map((offer) => ({
          id: offer.id,
          generationId,
          stationId: offer.stationId,
          family: offer.family,
          standardModel: offer.standardModel,
          groupName: offer.groupName ?? null,
          billingMode: offer.billingMode,
          currency: offer.currency,
          rechargeRatio: transitRechargeRatio(offer),
          rechargeCoefficient: offer.rechargeCoefficient ?? null,
          modelMultiplier: offer.modelMultiplier ?? null,
          stationGroupMultiplier: offer.stationGroupMultiplier ?? null,
          combinedMultiplier: transitCombinedMultiplier(offer),
          inputPrice: offer.inputPrice ?? null,
          outputPrice: offer.outputPrice ?? null,
          cacheReadPrice: offer.cacheReadPrice ?? null,
          cacheWritePrice: offer.cacheWritePrice ?? null,
          imageOutputPrice: offer.imageOutputPrice ?? null,
          fixedPrice: offer.fixedPrice ?? null,
          fixedPriceCurrency: offer.fixedPriceCurrency ?? null,
          fixedPriceUnit: offer.fixedPriceUnit ?? null,
          accountPool: offer.accountPool ?? null,
          channelType: offer.channelType ?? null,
          priceSourceUrl: offer.priceSourceUrl ?? null,
          priceSourceLabel: offer.priceSourceLabel ?? null,
          lastVerifiedAt: toDate(offer.lastVerifiedAt),
          availability: offer.availability,
          status: offer.status,
          payload: offer.payload,
          updatedAt: new Date(snapshot.generatedAt),
        })),
      );
    }
    if (snapshot.availabilitySamples.length) {
      await insertRows(
        tx,
        transitAvailabilitySamples,
        snapshot.availabilitySamples.map((sample) => ({
          id: sample.id,
          generationId,
          stationId: sample.stationId,
          offerId: sample.offerId ?? null,
          scope: sample.scope,
          standardModel: sample.standardModel ?? null,
          groupName: sample.groupName ?? null,
          sourceType: sample.sourceType,
          sourceUrl: sample.sourceUrl ?? null,
          matchLevel: sample.matchLevel,
          success: sample.success,
          latencyMs: sample.latencyMs ?? null,
          sampleCount: sample.sampleCount,
          sevenDayRate: sample.sevenDayRate ?? null,
          checkedAt: new Date(sample.checkedAt),
          expiresAt: toDate(sample.expiresAt),
          note: sample.note ?? null,
        })),
      );
    }
    await tx
      .update(publicDataGenerations)
      .set({
        status: "published",
        publishedAt: sql`clock_timestamp()`,
        error: null,
      })
      .where(eq(publicDataGenerations.id, generationId));
    return {
      domain: "transit",
      generationId,
      generatedAt: snapshot.generatedAt,
      recordCount: snapshot.stations.length,
      sourceCount: snapshot.sourceCount,
      contentHash: hash,
      published: true,
    };
  });
}
