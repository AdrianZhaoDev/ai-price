import type { ChannelListResult } from "@/lib/channels/repository";
import type {
  ChannelMerchant,
  ChannelMerchantSummary,
  ChannelOffer,
  ChannelProduct,
  ChannelProductSummary,
} from "@/lib/channels/types";
import type {
  TransitAvailability,
  TransitListResult,
  TransitOffer,
  TransitStation,
} from "@/lib/transit/types";
import { safePublicHttpUrl } from "@/lib/public-data/urls";

/**
 * Preserve the production rule that all /api endpoints are private/no-store.
 * Repository caching reduces reads without changing the proxy security policy.
 */
export const PUBLIC_API_CACHE_CONTROL = "private, no-store";

const publicHeaders = {
  "Cache-Control": PUBLIC_API_CACHE_CONTROL,
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

const channelDataStatuses = [
  "published",
  "verified",
  "sample",
  "pending_review",
  "stale",
  "degraded",
  "synthetic",
  "empty",
] as const;
const channelDataSources = [
  "database",
  "injected",
  "synthetic",
  "synthetic_fixture",
] as const;
const transitFallbackReasons = [
  "no_database_loader",
  "database_loader_unconfigured",
  "database_unavailable",
  "database_empty",
  "database_invalid",
] as const;
const transitRiskLabels = [
  "sample_data",
  "insufficient_samples",
  "mixed_pool",
  "reseller",
  "undisclosed_upstream",
  "third_party_aggregate",
  "pending_feedback",
] as const;

export function publicJson(
  body: unknown,
  options: { status?: number; cache?: boolean } = {},
): Response {
  return Response.json(body, {
    status: options.status ?? 200,
    headers: options.cache === false ? noStoreHeaders : publicHeaders,
  });
}

export function publicError(
  message: string,
  status: number,
  code?: string,
): Response {
  return publicJson(
    {
      ok: false,
      error: message,
      ...(code ? { code } : {}),
    },
    { status, cache: false },
  );
}

/**
 * Keep URLs useful to a browser while preventing accidental credential or
 * signed-query disclosure.  No request is made while validating a URL.
 */
export function publicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);

    // Signed links commonly put credentials in query parameters.  Preserve
    // ordinary public filters, but drop the entire query when a sensitive key
    // is present.  Fragments are never sent to a server and may contain a
    // secret, so they are always removed.
    const sensitiveQuery = [...parsed.searchParams.keys()].some((key) =>
      /(token|secret|password|passwd|authorization|credential|session|cookie|api[-_]?key|signature|^sig$)/i.test(
        key,
      ),
    );
    parsed.hash = "";
    if (sensitiveQuery) parsed.search = "";
    return safePublicHttpUrl(parsed.toString());
  } catch {
    return null;
  }
}

function text(value: unknown, max = 2_048): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  // Control characters are not useful in a JSON API and can make logs or
  // downstream HTML unsafe.  Newlines are allowed in explanatory summaries.
  if (
    [...trimmed].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    })
  ) {
    return null;
  }
  return trimmed;
}

function nullableText(value: unknown, max = 2_048): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, max);
}

function date(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function strings(value: unknown, maxItems = 64, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, maxLength))
    .filter((item): item is string => item !== null)
    .slice(0, maxItems);
}

function currency(value: unknown): string | null {
  const result = text(value, 3)?.toUpperCase();
  return result && /^[A-Z]{3}$/.test(result) ? result : null;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : null;
}

function safeRecordText(value: unknown, max = 240): string | null {
  // Specifications can be a structured object in the internal model.  Do not
  // pass arbitrary objects through: that is where payloads and credentials
  // most often hide.
  return typeof value === "string" ? text(value, max) : null;
}

function publicNarrative(value: unknown, max: number): string | null {
  const result = text(value, max);
  if (
    result &&
    /(api[-_ ]?key|authorization|bearer|password|passwd|secret|access[-_ ]?token|refresh[-_ ]?token)\s*[:=]/i.test(
      result,
    )
  ) {
    return null;
  }
  return result;
}

function publicTier(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    minQuantity: integer(row.minQuantity),
    priceMinor: integer(row.priceMinor),
    currency: currency(row.currency),
  };
}

export function publicChannelOffer(
  offer: ChannelOffer,
): Record<string, unknown> {
  return {
    id: text(offer.id, 160),
    merchantId: text(offer.merchantId, 120),
    merchantName: text(offer.merchantName, 160),
    productId: text(offer.productId, 160),
    productName: text(offer.productName, 240),
    platform: nullableText(offer.platform, 80),
    productType: nullableText(offer.productType, 80),
    specification: safeRecordText(offer.specification),
    rawTitle: text(offer.rawTitle, 320),
    sourceUrl: publicUrl(offer.sourceUrl),
    offerUrl: publicUrl(offer.offerUrl),
    priceMinor: integer(offer.priceMinor),
    currency: currency(offer.currency),
    availabilityStatus: enumValue(offer.availabilityStatus, [
      "in_stock",
      "out_of_stock",
      "unknown",
      "expired",
      "unavailable",
    ] as const),
    stockQuantity: integer(offer.stockQuantity),
    minPurchaseQuantity: integer(offer.minPurchaseQuantity),
    tiers: Array.isArray(offer.tiers)
      ? offer.tiers
          .map(publicTier)
          .filter((item): item is Record<string, unknown> => item !== null)
      : [],
    labels: strings(offer.labels),
    riskLabels: strings(offer.riskLabels),
    expiresAt: date(offer.expiresAt),
    firstSeenAt: date(offer.firstSeenAt),
    lastSeenAt: date(offer.lastSeenAt),
    observedAt: date(offer.observedAt),
    classificationConfidence: number(offer.classificationConfidence),
    sourceHealth: enumValue(offer.sourceHealth, [
      "healthy",
      "unknown",
      "degraded",
      "failed",
    ] as const),
    accessMode: enumValue(offer.accessMode, [
      "public",
      "authorized",
      "submission",
    ] as const),
    publicationStatus: enumValue(offer.publicationStatus, [
      "draft",
      "pending_review",
      "verified",
      "published",
      "rejected",
      "suspended",
    ] as const),
    published: bool(offer.published),
    synthetic: bool(offer.synthetic),
  };
}

export function isPublicChannelOffer(offer: ChannelOffer): boolean {
  return (
    offer.published !== false &&
    (offer.publicationStatus === "published" ||
      offer.publicationStatus === "verified")
  );
}

export function publicChannelMerchant(
  merchant: ChannelMerchant,
): Record<string, unknown> {
  return {
    id: text(merchant.id, 120),
    slug: text(merchant.slug, 120),
    name: text(merchant.name, 160),
    host: nullableText(merchant.host, 160),
    websiteUrl: publicUrl(merchant.websiteUrl),
    status: enumValue(merchant.status, [
      "active",
      "pending_review",
      "suspended",
      "closed",
    ] as const),
    operatorType: nullableText(merchant.operatorType, 80),
    platforms: strings(merchant.platforms),
    riskLabels: strings(merchant.riskLabels),
    lastReviewedAt: date(merchant.lastReviewedAt),
  };
}

export function publicChannelProduct(
  product: ChannelProduct,
): Record<string, unknown> {
  return {
    id: text(product.id, 160),
    slug: text(product.slug, 160),
    name: text(product.name, 240),
    platform: nullableText(product.platform, 80),
    productType: nullableText(product.productType, 80),
    specification: safeRecordText(product.specification),
    aliases: strings(product.aliases),
    reviewStatus: enumValue(product.reviewStatus, [
      "draft",
      "pending_review",
      "verified",
      "published",
      "suspended",
    ] as const),
  };
}

function publicChannelProductSummary(
  product: ChannelProductSummary,
): Record<string, unknown> {
  return {
    productId: text(product.productId, 160),
    productName: text(product.productName, 240),
    platform: nullableText(product.platform, 80),
    productType: nullableText(product.productType, 80),
    offerCount: integer(product.offerCount),
    availableOfferCount: integer(product.availableOfferCount),
    merchantCount: integer(product.merchantCount),
    lowestPriceMinor: integer(product.lowestPriceMinor),
    lowestCurrency: currency(product.lowestCurrency),
    lowestOfferId: nullableText(product.lowestOfferId, 160),
    lowestAvailableOffer:
      product.lowestAvailableOffer &&
      isPublicChannelOffer(product.lowestAvailableOffer)
        ? publicChannelOffer(product.lowestAvailableOffer)
        : null,
    lastSeenAt: date(product.lastSeenAt),
  };
}

function publicChannelMerchantSummary(
  merchant: ChannelMerchantSummary,
): Record<string, unknown> {
  return {
    merchantId: text(merchant.merchantId, 120),
    merchantName: text(merchant.merchantName, 160),
    offerCount: integer(merchant.offerCount),
    availableOfferCount: integer(merchant.availableOfferCount),
    productCount: integer(merchant.productCount),
    lowestPriceHits: integer(merchant.lowestPriceHits),
    topFiveHits: integer(merchant.topFiveHits),
    lastSeenAt: date(merchant.lastSeenAt),
  };
}

function publicChannelWarning(
  result: Pick<ChannelListResult, "dataStatus" | "dataSource">,
): string | undefined {
  if (result.dataStatus === "synthetic" || result.dataSource === "synthetic") {
    return "Synthetic fixture only; this response is not production data.";
  }
  if (result.dataStatus === "degraded") {
    return "Public data is temporarily unavailable; this response may be incomplete.";
  }
  if (result.dataStatus === "stale") {
    return "The latest public snapshot may be stale.";
  }
  return undefined;
}

export type ChannelResponseView = "all" | "offers" | "products" | "merchants";

export function publicChannelList(
  result: ChannelListResult,
  view: ChannelResponseView = "all",
): Record<string, unknown> {
  const offers = result.offers
    .filter(isPublicChannelOffer)
    .map(publicChannelOffer);
  const products = result.products.map(publicChannelProductSummary);
  const merchants = result.merchants.map(publicChannelMerchantSummary);
  const items =
    view === "offers"
      ? offers
      : view === "products"
        ? products
        : view === "merchants"
          ? merchants
          : offers;
  const body: Record<string, unknown> = {
    ok: true,
    apiVersion: 1,
    schemaVersion: 1,
    domain: "channels",
    view,
    total: integer(items.length),
    totalOffers: integer(result.totalOffers),
    totalProducts: integer(products.length),
    totalMerchants: integer(merchants.length),
    items,
    generatedAt: date(result.generatedAt),
    generationId: nullableText(result.generationId, 200),
    dataStatus: enumValue(result.dataStatus, channelDataStatuses),
    dataSource: enumValue(result.dataSource, channelDataSources),
    synthetic:
      result.dataStatus === "synthetic" ||
      result.dataSource === "synthetic" ||
      result.dataSource === "synthetic_fixture",
    degraded: result.dataStatus === "degraded",
    ...(publicChannelWarning(result)
      ? { warning: publicChannelWarning(result) }
      : {}),
    policy: {
      readOnly: true,
      requestTimeCollection: false,
      sourceLinksAreReferences: true,
    },
  };
  if (view === "all" || view === "offers") body.offers = offers;
  if (view === "all" || view === "products") body.products = products;
  if (view === "all" || view === "merchants") body.merchants = merchants;
  return body;
}

const transitStationStatuses = [
  "active",
  "limited",
  "unavailable",
  "unknown",
] as const;
const transitDataStatuses = [
  "sample",
  "pending_review",
  "verified",
  "unpublished",
] as const;
const transitSourceTypes = [
  "manual_collected",
  "user_submitted",
  "merchant_submitted",
  "public_status",
  "public_model_catalog",
  "partner_api",
  "manual_snapshot",
  "authorized_probe",
  "synthetic_fixture",
  "unknown",
] as const;
const transitCommercialRelations = [
  "none",
  "listed",
  "partner",
  "affiliate",
  "sponsored",
  "unknown",
] as const;
const transitOperatorTypes = ["company", "individual", "unknown"] as const;
const transitStationSystems = [
  "new_api",
  "sub_to_api",
  "custom",
  "unknown",
] as const;
const transitChannelTypes = [
  "official_api",
  "cloud",
  "first_party_pool",
  "reverse_engineered",
  "first_party_wholesale",
  "reseller",
  "mixed",
  "undisclosed",
  "unknown",
] as const;
const transitAccountPools = [
  "pro",
  "plus",
  "max",
  "team",
  "kiro",
  "enterprise",
  "official_api",
  "mixed",
  "undisclosed",
  "unknown",
] as const;
const transitBillingModes = ["token", "per_request", "fixed"] as const;
const transitOfferStatuses = [
  "verified",
  "pending_review",
  "unavailable",
  "unknown",
] as const;
const transitAvailabilitySources = [
  "public_status",
  "public_model_catalog",
  "partner_api",
  "merchant_reported",
  "manual_snapshot",
  "authorized_probe",
  "user_submitted",
  "synthetic_fixture",
  "unknown",
] as const;
const transitScopes = ["station", "group", "model", "offer"] as const;
const transitMatchLevels = [
  "exact",
  "group",
  "model",
  "family",
  "station",
  "unknown",
] as const;

function publicTransitAvailability(
  availability: TransitAvailability,
): Record<string, unknown> {
  return {
    sevenDayRate: number(availability.sevenDayRate),
    sevenDaySamples: integer(availability.sevenDaySamples),
    firstCheckedAt: date(availability.firstCheckedAt),
    lastCheckedAt: date(availability.lastCheckedAt),
    latestLatencyMs: number(availability.latestLatencyMs),
    averageLatency7dMs: number(availability.averageLatency7dMs),
    note: publicNarrative(availability.note, 500),
    sourceType: enumValue(availability.sourceType, transitAvailabilitySources),
    sourceLabel: nullableText(availability.sourceLabel, 200),
    sourceUrl: publicUrl(availability.sourceUrl),
    scope: enumValue(availability.scope, transitScopes),
    matchLevel: enumValue(availability.matchLevel, transitMatchLevels),
    monitoringScopeId: nullableText(availability.monitoringScopeId, 200),
    recentSamples: Array.isArray(availability.recentSamples)
      ? availability.recentSamples.slice(0, 100).map((sample) => ({
          ok: bool(sample.ok),
          checkedAt: date(sample.checkedAt),
          latencyMs: number(sample.latencyMs),
        }))
      : [],
  };
}

export function publicTransitOffer(
  offer: TransitOffer,
): Record<string, unknown> {
  return {
    id: text(offer.id, 160),
    stationId: text(offer.stationId, 160),
    family: text(offer.family, 40),
    standardModelId: text(offer.standardModelId, 160),
    standardModelLabel: text(offer.standardModelLabel, 160),
    standardModel: nullableText(offer.standardModel, 160),
    groupName: text(offer.groupName, 160),
    billingMode: enumValue(offer.billingMode, transitBillingModes),
    currency: currency(offer.currency),
    rechargeRatioRaw: nullableText(offer.rechargeRatioRaw, 100),
    rechargeRatio: number(offer.rechargeRatio),
    rechargeCoefficient: number(offer.rechargeCoefficient),
    modelMultiplier: number(offer.modelMultiplier),
    stationGroupMultiplier: number(offer.stationGroupMultiplier),
    combinedRate: number(offer.combinedRate),
    combinedMultiplier: number(offer.combinedMultiplier),
    inputPrice: number(offer.inputPrice),
    outputPrice: number(offer.outputPrice),
    cacheReadPrice: number(offer.cacheReadPrice),
    cacheWritePrice: number(offer.cacheWritePrice),
    imageOutputPrice: number(offer.imageOutputPrice),
    fixedPrice: number(offer.fixedPrice),
    fixedPriceUnit: nullableText(offer.fixedPriceUnit, 100),
    fixedPriceCurrency: currency(offer.fixedPriceCurrency),
    accountPool: enumValue(offer.accountPool, transitAccountPools),
    channelType: enumValue(offer.channelType, transitChannelTypes),
    priceSourceUrl: publicUrl(offer.priceSourceUrl),
    priceSourceLabel: nullableText(offer.priceSourceLabel, 200),
    lastVerifiedAt: date(offer.lastVerifiedAt),
    availability: publicTransitAvailability(offer.availability),
    status: enumValue(offer.status, transitOfferStatuses),
  };
}

export function publicTransitStation(
  station: TransitStation,
): Record<string, unknown> {
  const offers = station.offers
    .filter(
      (offer) => offer.status === undefined || offer.status === "verified",
    )
    .map(publicTransitOffer);
  return {
    id: text(station.id, 160),
    slug: text(station.slug, 100),
    name: text(station.name, 200),
    websiteUrl: publicUrl(station.websiteUrl),
    apiBaseUrl: publicUrl(station.apiBaseUrl),
    monitorUrl: publicUrl(station.monitorUrl),
    stationSystem: enumValue(station.stationSystem, transitStationSystems),
    operatorType: enumValue(station.operatorType, transitOperatorTypes),
    status: enumValue(station.status, transitStationStatuses),
    sourceType: enumValue(station.sourceType, transitSourceTypes),
    commercialRelation: enumValue(
      station.commercialRelation,
      transitCommercialRelations,
    ),
    summary: publicNarrative(station.summary, 1_000),
    channelTypes: station.channelTypes
      .map((value) => enumValue(value, transitChannelTypes))
      .filter(
        (value): value is (typeof transitChannelTypes)[number] =>
          value !== null,
      ),
    accountPools: station.accountPools
      .map((value) => enumValue(value, transitAccountPools))
      .filter(
        (value): value is (typeof transitAccountPools)[number] =>
          value !== null,
      ),
    paymentMethods: strings(station.paymentMethods, 30, 80),
    minimumTopUp: nullableText(station.minimumTopUp, 100),
    balanceExpiry: nullableText(station.balanceExpiry, 100),
    riskLabels: strings(station.riskLabels, 30, 80),
    usageAdvice: enumValue(station.usageAdvice, [
      "try_small",
      "cautious",
      "not_recommended",
      "pending",
    ] as const),
    usageAdviceTags: strings(station.usageAdviceTags, 30, 80),
    lastUpdatedAt: date(station.lastUpdatedAt),
    lastCollectedAt: date(station.lastCollectedAt),
    dataStatus: enumValue(station.dataStatus, transitDataStatuses),
    availability: publicTransitAvailability(station.availability),
    sourceUrl: publicUrl(station.sourceUrl),
    sourceLabel: nullableText(station.sourceLabel, 200),
    offers,
    prices: offers,
    synthetic: bool(station.synthetic),
  };
}

function publicTransitWarning(
  result: Pick<TransitListResult, "dataStatus" | "isSynthetic" | "degraded">,
): string | undefined {
  if (result.isSynthetic) {
    return "Synthetic fixture only; this response is not production data.";
  }
  if (result.degraded) {
    return "Public data is temporarily unavailable; this response may be incomplete.";
  }
  if (result.dataStatus === "pending_review") {
    return "Some records are pending review.";
  }
  return undefined;
}

export function publicTransitList(
  result: TransitListResult,
): Record<string, unknown> {
  const stations = result.items
    .filter(
      (station) =>
        (station.status === "active" || station.status === "limited") &&
        (station.dataStatus === "verified" ||
          (result.isSynthetic && station.dataStatus === "sample")),
    )
    .map(publicTransitStation);
  const warning = publicTransitWarning(result);
  return {
    ok: true,
    apiVersion: 1,
    schemaVersion: 1,
    domain: "transit",
    items: stations,
    stations,
    total: integer(result.total),
    nextCursor: nullableText(result.nextCursor, 200),
    generatedAt: date(result.generatedAt),
    generationId: text(result.generationId, 200),
    sourcePolicyVersion: text(result.sourcePolicyVersion, 80),
    origin: enumValue(result.origin, [
      "database",
      "synthetic_fixture",
    ] as const),
    dataSource: enumValue(result.dataSource, [
      "database",
      "synthetic_fixture",
    ] as const),
    isSynthetic: bool(result.isSynthetic),
    degraded: bool(result.degraded),
    dataStatus: enumValue(result.dataStatus, [
      "sample",
      "pending_review",
      "verified",
      "degraded",
    ] as const),
    fallbackReason: enumValue(result.fallbackReason, transitFallbackReasons),
    query: {
      ...(result.query.q ? { q: text(result.query.q, 100) } : {}),
      ...(result.query.family ? { family: text(result.query.family, 40) } : {}),
      ...(result.query.model ? { model: text(result.query.model, 160) } : {}),
      ...(result.query.channel
        ? { channel: enumValue(result.query.channel, transitChannelTypes) }
        : {}),
      ...(result.query.pool
        ? { pool: enumValue(result.query.pool, transitAccountPools) }
        : {}),
      ...(result.query.risk
        ? { risk: enumValue(result.query.risk, transitRiskLabels) }
        : {}),
      sort: enumValue(result.query.sort, [
        "overall",
        "rate",
        "stability",
        "updated",
        "name",
      ] as const),
      limit: integer(result.query.limit),
      ...(result.query.cursor
        ? { cursor: text(result.query.cursor, 200) }
        : {}),
      includeUnpublished: false,
    },
    ...(warning ? { warning } : {}),
    policy: {
      readOnly: true,
      requestTimeCollection: false,
      availabilityIsObservational: true,
    },
  };
}

export function publicTransitDetail(
  station: TransitStation,
  metadata?: Partial<TransitListResult>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ok: true,
    apiVersion: 1,
    schemaVersion: 1,
    domain: "transit",
    station: publicTransitStation(station),
  };
  if (metadata) {
    const warning = publicTransitWarning({
      dataStatus: metadata.dataStatus ?? "verified",
      isSynthetic: metadata.isSynthetic === true,
      degraded: metadata.degraded === true,
    });
    Object.assign(body, {
      generatedAt: date(metadata.generatedAt),
      generationId: text(metadata.generationId, 200),
      sourcePolicyVersion: text(metadata.sourcePolicyVersion, 80),
      origin: enumValue(metadata.origin, [
        "database",
        "synthetic_fixture",
      ] as const),
      dataSource: enumValue(metadata.dataSource, [
        "database",
        "synthetic_fixture",
      ] as const),
      isSynthetic: bool(metadata.isSynthetic),
      degraded: bool(metadata.degraded),
      dataStatus: enumValue(metadata.dataStatus, [
        "sample",
        "pending_review",
        "verified",
        "degraded",
      ] as const),
      fallbackReason: enumValue(
        metadata.fallbackReason,
        transitFallbackReasons,
      ),
      ...(warning ? { warning } : {}),
      policy: {
        readOnly: true,
        requestTimeCollection: false,
        availabilityIsObservational: true,
      },
    });
  }
  return body;
}
