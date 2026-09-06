import { isSafePublicHttpUrl, safePublicHttpUrl } from "@/lib/public-data/urls";
import type { ChannelListResult } from "@/lib/channels/repository";
import type {
  ChannelMerchant,
  ChannelMerchantSummary,
  ChannelOffer,
  ChannelProduct,
  ChannelProductSummary,
  ChannelSnapshot,
} from "@/lib/channels/types";
import type {
  TransitAvailability,
  TransitListResult,
  TransitOffer,
  TransitReadModel,
  TransitStation,
} from "@/lib/transit/types";
import { TRANSIT_LIST_OFFER_LIMIT } from "@/lib/transit/types";

/** Public JSON contract version.  Increment when a field is removed/changed. */
export const PUBLIC_DATA_API_VERSION = 1;

const sensitiveKey =
  /token|secret|password|passwd|authorization|credential|session|cookie|api[-_]?key|signature|bearer/i;

function safeWarning(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  // Warnings are operational hints, not an error log.  Keep them bounded and
  // remove line breaks so a malformed source cannot forge response headers/logs.
  const cleaned = value
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 320);
  return cleaned || undefined;
}

function safeText(value: unknown, max = 2_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function safeDate(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeJson(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null) return value === null ? null : undefined;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (typeof value === "number" || typeof value === "boolean") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => safeJson(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (sensitiveKey.test(key)) continue;
      const next = safeJson(item, depth + 1);
      if (next !== undefined) output[key.slice(0, 80)] = next;
    }
    return output;
  }
  return undefined;
}

function safeUrl(value: unknown): string | null {
  return isSafePublicHttpUrl(value) ? safePublicHttpUrl(value) : null;
}

export function serializeChannelOffer(offer: ChannelOffer) {
  return {
    id: offer.id,
    merchantId: offer.merchantId,
    merchantName: offer.merchantName,
    productId: offer.productId,
    productName: offer.productName,
    platform: offer.platform ?? null,
    productType: offer.productType ?? null,
    specification: safeJson(offer.specification) ?? null,
    title: offer.rawTitle,
    source: {
      id: offer.sourceId,
      type: offer.sourceType,
      health: offer.sourceHealth,
      name: offer.sourceId,
      url: safeUrl(offer.sourceUrl),
    },
    offerUrl: safeUrl(offer.offerUrl),
    priceMinor: offer.priceMinor,
    currency: offer.currency,
    availability: offer.availabilityStatus,
    stockQuantity: offer.stockQuantity ?? null,
    minPurchaseQuantity: offer.minPurchaseQuantity ?? null,
    tiers: offer.tiers.map((tier) => ({
      minQuantity: tier.minQuantity,
      priceMinor: tier.priceMinor,
      currency: tier.currency,
    })),
    labels: offer.labels.slice(0, 64),
    riskLabels: offer.riskLabels.slice(0, 64),
    publicationStatus: offer.publicationStatus,
    published: offer.published,
    classificationConfidence: offer.classificationConfidence,
    observedAt: safeDate(offer.observedAt),
    firstSeenAt: safeDate(offer.firstSeenAt),
    lastSeenAt: safeDate(offer.lastSeenAt),
    expiresAt: safeDate(offer.expiresAt),
    synthetic: offer.synthetic,
  };
}

export function serializeChannelMerchant(merchant: ChannelMerchant) {
  return {
    id: merchant.id,
    slug: merchant.slug,
    name: merchant.name,
    host: merchant.host ?? null,
    websiteUrl: safeUrl(merchant.websiteUrl),
    status: merchant.status,
    operatorType: merchant.operatorType ?? null,
    platforms: merchant.platforms.slice(0, 64),
    riskLabels: merchant.riskLabels.slice(0, 64),
    lastReviewedAt: safeDate(merchant.lastReviewedAt),
  };
}

export function serializeChannelProduct(product: ChannelProduct) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    platform: product.platform ?? null,
    productType: product.productType ?? null,
    specification: safeJson(product.specification) ?? null,
    aliases: product.aliases.slice(0, 64),
    reviewStatus: product.reviewStatus,
  };
}

function serializeChannelProductSummary(summary: ChannelProductSummary) {
  return {
    productId: summary.productId,
    productName: summary.productName,
    platform: summary.platform ?? null,
    productType: summary.productType ?? null,
    offerCount: summary.offerCount,
    availableOfferCount: summary.availableOfferCount,
    merchantCount: summary.merchantCount,
    lowestPriceMinor: summary.lowestPriceMinor ?? null,
    lowestCurrency: summary.lowestCurrency ?? null,
    lowestOffer: summary.lowestAvailableOffer
      ? serializeChannelOffer(summary.lowestAvailableOffer)
      : null,
    lastSeenAt: safeDate(summary.lastSeenAt),
  };
}

function serializeChannelMerchantSummary(summary: ChannelMerchantSummary) {
  return {
    merchantId: summary.merchantId,
    merchantName: summary.merchantName,
    offerCount: summary.offerCount,
    availableOfferCount: summary.availableOfferCount,
    productCount: summary.productCount,
    lowestPriceHits: summary.lowestPriceHits,
    topFiveHits: summary.topFiveHits,
    lastSeenAt: safeDate(summary.lastSeenAt),
  };
}

export function serializeChannelList(
  result: ChannelListResult,
  options: { view?: "products" | "offers" | "merchants"; query?: unknown } = {},
) {
  const view = options.view ?? "products";
  const offers = result.offers.map(serializeChannelOffer);
  const products = result.products.map(serializeChannelProductSummary);
  const merchants = result.merchants.map(serializeChannelMerchantSummary);
  const items =
    view === "offers" ? offers : view === "merchants" ? merchants : products;
  return {
    apiVersion: PUBLIC_DATA_API_VERSION,
    schemaVersion: 1,
    domain: "channels" as const,
    view,
    generatedAt: safeDate(result.generatedAt),
    generationId: result.generationId ?? null,
    dataStatus: result.dataStatus,
    dataSource: result.dataSource,
    total:
      view === "offers"
        ? result.totalOffers
        : view === "merchants"
          ? merchants.length
          : products.length,
    totalOffers: result.totalOffers,
    totalProducts: products.length,
    totalMerchants: merchants.length,
    items,
    offers,
    products,
    merchants,
    query: safeJson(options.query) ?? null,
    warning: safeWarning(result.warning) ?? null,
    policy: {
      readOnly: true,
      requestTimeCollection: false,
      sourceLinksAreReferences: true,
    },
  };
}

export function serializeChannelSnapshot(snapshot: ChannelSnapshot) {
  return {
    apiVersion: PUBLIC_DATA_API_VERSION,
    schemaVersion: 1,
    domain: "channels" as const,
    generatedAt: safeDate(snapshot.generatedAt),
    generationId: snapshot.generationId ?? null,
    dataStatus: snapshot.dataStatus,
    dataSource: snapshot.dataSource,
    sourceCount: snapshot.sourceCount ?? null,
    offers: snapshot.offers.map(serializeChannelOffer),
    merchants: (snapshot.merchants ?? []).map(serializeChannelMerchant),
    products: (snapshot.products ?? []).map(serializeChannelProduct),
    warning: safeWarning(snapshot.warning) ?? null,
  };
}

export function serializeTransitAvailability(
  availability: TransitAvailability,
) {
  return {
    sevenDayRate: availability.sevenDayRate,
    sevenDaySamples: availability.sevenDaySamples,
    firstCheckedAt: safeDate(availability.firstCheckedAt),
    lastCheckedAt: safeDate(availability.lastCheckedAt),
    latestLatencyMs: availability.latestLatencyMs,
    averageLatency7dMs: availability.averageLatency7dMs,
    note: safeText(availability.note, 500) ?? null,
    sourceType: availability.sourceType,
    sourceLabel: safeText(availability.sourceLabel, 200) ?? null,
    sourceUrl: safeUrl(availability.sourceUrl),
    scope: availability.scope,
    matchLevel: availability.matchLevel,
    monitoringScopeId: safeText(availability.monitoringScopeId, 200) ?? null,
    recentSamples: availability.recentSamples.slice(0, 100).map((sample) => ({
      ok: sample.ok,
      checkedAt: safeDate(sample.checkedAt),
      latencyMs: sample.latencyMs,
    })),
  };
}

export function serializeTransitOffer(offer: TransitOffer) {
  return {
    id: offer.id,
    stationId: offer.stationId,
    family: offer.family,
    standardModelId: offer.standardModelId,
    standardModelLabel: offer.standardModelLabel,
    groupName: offer.groupName,
    billingMode: offer.billingMode,
    currency: offer.currency,
    rechargeRatioRaw: offer.rechargeRatioRaw,
    rechargeRatio: offer.rechargeRatio ?? null,
    rechargeCoefficient: offer.rechargeCoefficient,
    modelMultiplier: offer.modelMultiplier,
    stationGroupMultiplier: offer.stationGroupMultiplier,
    combinedRate: offer.combinedRate,
    inputPrice: offer.inputPrice,
    outputPrice: offer.outputPrice,
    cacheReadPrice: offer.cacheReadPrice,
    cacheWritePrice: offer.cacheWritePrice,
    imageOutputPrice: offer.imageOutputPrice,
    fixedPrice: offer.fixedPrice,
    fixedPriceUnit: offer.fixedPriceUnit,
    fixedPriceCurrency: offer.fixedPriceCurrency ?? null,
    accountPool: offer.accountPool,
    channelType: offer.channelType,
    priceSource: {
      label: safeText(offer.priceSourceLabel, 200) ?? null,
      url: safeUrl(offer.priceSourceUrl),
    },
    lastVerifiedAt: safeDate(offer.lastVerifiedAt),
    availability: serializeTransitAvailability(offer.availability),
    status: offer.status ?? "verified",
  };
}

export function serializeTransitStation(
  station: TransitStation,
  options: { includeOffers?: boolean; offerLimit?: number } = {},
) {
  const includeOffers = options.includeOffers ?? true;
  const offers = includeOffers
    ? station.offers.slice(0, options.offerLimit).map(serializeTransitOffer)
    : [];
  return {
    id: station.id,
    slug: station.slug,
    name: station.name,
    websiteUrl: safeUrl(station.websiteUrl),
    apiBaseUrl: safeUrl(station.apiBaseUrl),
    monitorUrl: safeUrl(station.monitorUrl),
    stationSystem: station.stationSystem,
    operatorType: station.operatorType,
    status: station.status,
    sourceType: station.sourceType,
    source: {
      label: safeText(station.sourceLabel, 200) ?? null,
      url: safeUrl(station.sourceUrl),
    },
    commercialRelation: station.commercialRelation,
    summary: safeText(station.summary, 1_000) ?? "",
    channelTypes: station.channelTypes,
    accountPools: station.accountPools,
    paymentMethods: station.paymentMethods,
    minimumTopUp: station.minimumTopUp,
    balanceExpiry: station.balanceExpiry,
    riskLabels: station.riskLabels,
    usageAdvice: station.usageAdvice,
    usageAdviceTags: station.usageAdviceTags ?? [],
    lastUpdatedAt: safeDate(station.lastUpdatedAt),
    lastCollectedAt: safeDate(station.lastCollectedAt),
    dataStatus: station.dataStatus,
    synthetic: station.synthetic,
    availability: serializeTransitAvailability(station.availability),
    offers,
    prices: offers,
    offerCount: station.offerCount ?? station.offers.length,
    offersTruncated:
      station.offersTruncated === true || offers.length < station.offers.length,
  };
}

export function serializeTransitList(result: TransitListResult) {
  const items = result.items.map((station) =>
    serializeTransitStation(station, { offerLimit: TRANSIT_LIST_OFFER_LIMIT }),
  );
  return {
    apiVersion: PUBLIC_DATA_API_VERSION,
    schemaVersion: 1,
    domain: "transit" as const,
    items,
    stations: items,
    total: result.total,
    nextCursor: result.nextCursor,
    generatedAt: safeDate(result.generatedAt),
    generationId: result.generationId,
    sourcePolicyVersion: result.sourcePolicyVersion,
    origin: result.origin,
    dataSource: result.dataSource ?? result.origin,
    isSynthetic: result.isSynthetic,
    degraded: result.degraded,
    dataStatus: result.dataStatus,
    fallbackReason: result.fallbackReason,
    query: safeJson(result.query) ?? null,
    warning: safeWarning(result.warning) ?? null,
    policy: {
      readOnly: true,
      requestTimeCollection: false,
      availabilityIsObservational: true,
    },
  };
}

export function serializeTransitReadModel(model: TransitReadModel) {
  return {
    apiVersion: PUBLIC_DATA_API_VERSION,
    schemaVersion: 1,
    domain: "transit" as const,
    generatedAt: safeDate(model.generatedAt),
    generationId: model.generationId,
    sourcePolicyVersion: model.sourcePolicyVersion,
    origin: model.origin,
    dataSource: model.dataSource ?? model.origin,
    isSynthetic: model.isSynthetic,
    degraded: model.degraded,
    dataStatus: model.dataStatus,
    fallbackReason: model.fallbackReason,
    stations: model.stations.map((station) => serializeTransitStation(station)),
    warning: safeWarning(model.warning) ?? null,
  };
}
