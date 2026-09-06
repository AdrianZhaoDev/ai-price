import {
  parseChannelOfferFilters,
  type ChannelMerchantSummary,
  type ChannelOffer,
  type ChannelOfferFilters,
  type ChannelProduct,
  type ChannelProductSummary,
  type ChannelSort,
  type ChannelSortInput,
} from "./types";

export type OfferAvailabilityOptions = {
  now?: Date;
  requireHealthySource?: boolean;
  maxAgeMs?: number;
};

export type DedupeOptions = OfferAvailabilityOptions;

function asDate(value: Date | undefined): Date {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : new Date();
}

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareText(
  left: string | undefined,
  right: string | undefined,
): number {
  const a = left ?? "";
  const b = right ?? "";
  return a < b ? -1 : a > b ? 1 : 0;
}

function availabilityOf(offer: ChannelOffer): string {
  const candidate = offer as ChannelOffer & {
    availability?: string;
  };
  return candidate.availabilityStatus ?? candidate.availability ?? "unknown";
}

function publicationOf(offer: ChannelOffer): string {
  return (offer.publicationStatus ?? "published").toLowerCase();
}

function sourceHealthOf(offer: ChannelOffer): string {
  return (offer.sourceHealth ?? "unknown").toLowerCase();
}

/**
 * Whether an offer can be shown as currently in stock.  This deliberately
 * does not silently convert `unknown` into available: unknown rows may be
 * listed, but cannot win a lowest-price comparison.
 */
export function isOfferAvailable(
  offer: ChannelOffer,
  nowOrOptions: Date | OfferAvailabilityOptions = new Date(),
): boolean {
  const options =
    nowOrOptions instanceof Date ? { now: nowOrOptions } : nowOrOptions;
  const now = asDate(options.now);
  const availability = availabilityOf(offer);
  if (availability !== "in_stock") return false;
  if (offer.priceMinor === null || !Number.isFinite(offer.priceMinor)) {
    return false;
  }
  if (!offer.offerUrl) return false;
  if (offer.published === false) return false;
  if (!["published", "verified"].includes(publicationOf(offer))) return false;
  if (sourceHealthOf(offer) === "failed") return false;
  if (
    options.requireHealthySource === true &&
    sourceHealthOf(offer) !== "healthy"
  ) {
    return false;
  }
  if (offer.stockQuantity !== null && offer.stockQuantity !== undefined) {
    if (!Number.isFinite(offer.stockQuantity) || offer.stockQuantity <= 0) {
      return false;
    }
  }
  if (offer.expiresAt && timestamp(offer.expiresAt) <= now.getTime()) {
    return false;
  }
  if (options.maxAgeMs !== undefined && options.maxAgeMs >= 0) {
    const age = now.getTime() - timestamp(offer.lastSeenAt);
    if (age > options.maxAgeMs) return false;
  }
  return true;
}

/** Lowest-price eligibility is stricter than merely being displayable. */
export function isOfferEligibleForLowestPrice(
  offer: ChannelOffer,
  nowOrOptions: Date | OfferAvailabilityOptions = new Date(),
): boolean {
  const options =
    nowOrOptions instanceof Date ? { now: nowOrOptions } : nowOrOptions;
  return isOfferAvailable(offer, {
    ...options,
    requireHealthySource: true,
  });
}

function sourcePriority(offer: ChannelOffer): number {
  const sourceTypePriority: Record<string, number> = {
    authorized_feed: 50,
    public_api: 40,
    public_page: 30,
    merchant_submission: 20,
    manual_snapshot: 10,
  };
  const healthPriority: Record<string, number> = {
    healthy: 4,
    unknown: 2,
    degraded: 1,
    failed: 0,
  };
  return (
    (sourceTypePriority[offer.sourceType] ?? 0) * 10 +
    (healthPriority[sourceHealthOf(offer)] ?? 0)
  );
}

function publicationPriority(offer: ChannelOffer): number {
  const priorities: Record<string, number> = {
    published: 4,
    verified: 3,
    pending_review: 2,
    draft: 1,
    suspended: 0,
    rejected: 0,
  };
  return priorities[publicationOf(offer)] ?? 0;
}

function dedupeKeyOf(offer: ChannelOffer): string {
  const candidate = offer as ChannelOffer & {
    dedupeKey?: string;
    public_dedupe_key?: string;
  };
  return (
    candidate.publicDedupeKey ??
    candidate.dedupeKey ??
    candidate.public_dedupe_key ??
    [offer.merchantId, offer.productId, offer.sourceId, offer.offerUrl].join(
      "|",
    )
  );
}

function compareDedupeWinner(
  left: ChannelOffer,
  right: ChannelOffer,
  options: DedupeOptions,
): number {
  const leftAvailable = isOfferAvailable(left, options);
  const rightAvailable = isOfferAvailable(right, options);
  if (leftAvailable !== rightAvailable) return leftAvailable ? -1 : 1;
  const publication = publicationPriority(right) - publicationPriority(left);
  if (publication) return publication;
  const source = sourcePriority(right) - sourcePriority(left);
  if (source) return source;
  const confidence =
    (right.classificationConfidence ?? 0) -
    (left.classificationConfidence ?? 0);
  if (confidence) return confidence;
  const seen = timestamp(right.lastSeenAt) - timestamp(left.lastSeenAt);
  if (seen) return seen;
  const observed = timestamp(right.observedAt) - timestamp(left.observedAt);
  if (observed) return observed;
  if (
    left.currency === right.currency &&
    left.priceMinor !== null &&
    right.priceMinor !== null &&
    left.priceMinor !== right.priceMinor
  ) {
    return left.priceMinor - right.priceMinor;
  }
  return compareText(left.id, right.id);
}

/**
 * Collapse rows sharing a public dedupe key.  The winner rules are explicit
 * and deterministic, and the input array is never mutated.
 */
export function dedupeChannelOffers(
  offers: readonly ChannelOffer[],
  options: DedupeOptions = {},
): ChannelOffer[] {
  const winners = new Map<string, ChannelOffer>();
  for (const offer of offers) {
    const key = dedupeKeyOf(offer);
    const current = winners.get(key);
    if (!current || compareDedupeWinner(offer, current, options) < 0) {
      winners.set(key, offer);
    }
  }
  return [...winners.values()];
}

// Familiar short alias for adapter authors.
export const dedupeOffers = dedupeChannelOffers;

function listContains(
  value: string | undefined,
  values: string[] | undefined,
): boolean {
  return !values?.length || (value !== undefined && values.includes(value));
}

function normalizedSearchText(offer: ChannelOffer): string {
  const specification =
    typeof offer.specification === "string"
      ? offer.specification
      : offer.specification
        ? Object.values(offer.specification).join(" ")
        : "";
  return [
    offer.productName,
    offer.rawTitle,
    offer.merchantName,
    offer.platform,
    offer.productType,
    specification,
    ...offer.labels,
    ...offer.riskLabels,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

/** Filter only; sorting and pagination are separate so callers can reuse it. */
export function filterChannelOffers(
  offers: readonly ChannelOffer[],
  input: Partial<ChannelOfferFilters> | unknown = {},
): ChannelOffer[] {
  const filters = parseChannelOfferFilters(input);
  const query = filters.query?.trim().toLocaleLowerCase();
  return offers.filter((offer) => {
    if (
      filters.publishedOnly &&
      (offer.published === false ||
        !["published", "verified"].includes(publicationOf(offer)))
    ) {
      return false;
    }
    if (query && !normalizedSearchText(offer).includes(query)) return false;
    if (!listContains(offer.merchantId, filters.merchantIds)) return false;
    if (!listContains(offer.productId, filters.productIds)) return false;
    if (!listContains(offer.platform, filters.platforms)) return false;
    if (!listContains(offer.productType, filters.productTypes)) return false;
    if (
      filters.sourceTypes?.length &&
      !filters.sourceTypes.includes(offer.sourceType)
    ) {
      return false;
    }
    if (
      filters.sourceHealth !== undefined &&
      sourceHealthOf(offer) !== filters.sourceHealth
    ) {
      return false;
    }
    if (
      filters.availability !== "all" &&
      availabilityOf(offer) !== filters.availability
    ) {
      return false;
    }
    if (
      filters.minPriceMinor !== undefined &&
      (offer.priceMinor === null || offer.priceMinor < filters.minPriceMinor)
    ) {
      return false;
    }
    if (
      filters.maxPriceMinor !== undefined &&
      (offer.priceMinor === null || offer.priceMinor > filters.maxPriceMinor)
    ) {
      return false;
    }
    return true;
  });
}

export const filterOffers = filterChannelOffers;

function availabilityRank(offer: ChannelOffer): number {
  const ranks: Record<string, number> = {
    in_stock: 0,
    unknown: 1,
    out_of_stock: 2,
    expired: 3,
    unavailable: 4,
  };
  return ranks[availabilityOf(offer)] ?? 9;
}

function priceCompare(left: ChannelOffer, right: ChannelOffer): number {
  // Currency conversion is intentionally not guessed here.  Different
  // currencies are grouped deterministically and compared only within a code.
  const currency = compareText(left.currency, right.currency);
  if (currency) return currency;
  if (left.priceMinor === null && right.priceMinor === null) return 0;
  if (left.priceMinor === null) return 1;
  if (right.priceMinor === null) return -1;
  return left.priceMinor - right.priceMinor;
}

function relevanceScore(
  offer: ChannelOffer,
  query: string | undefined,
): number {
  if (!query) return 0;
  const normalizedQuery = query.toLocaleLowerCase().trim();
  if (!normalizedQuery) return 0;
  const fields = [offer.productName, offer.rawTitle, offer.merchantName].map(
    (field) => field.toLocaleLowerCase(),
  );
  return fields.reduce(
    (score, field, index) =>
      score +
      (field === normalizedQuery ? 30 - index * 3 : 0) +
      (field.includes(normalizedQuery) ? 10 - index : 0),
    0,
  );
}

function resolveSort(input: ChannelSortInput | undefined): {
  by: ChannelSort;
  direction: "asc" | "desc";
  query?: string;
} {
  if (typeof input === "string") {
    if (input === "price_desc") return { by: "price", direction: "desc" };
    if (input === "price_asc") return { by: "price", direction: "asc" };
    if (input === "updated_desc") return { by: "updated", direction: "desc" };
    return {
      by: input,
      direction:
        input === "updated" || input === "availability" ? "desc" : "asc",
    };
  }
  const by = input?.by ?? "price";
  return {
    by,
    direction:
      input?.direction ??
      (by === "updated" || by === "availability" ? "desc" : "asc"),
    query: input?.query,
  };
}

/** Stable sorting with currency-aware price comparison and deterministic ties. */
export function sortChannelOffers(
  offers: readonly ChannelOffer[],
  input: ChannelSortInput = "price_asc",
): ChannelOffer[] {
  const sort = resolveSort(input);
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...offers].sort((left, right) => {
    // Keep unavailable rows out of the natural price/relevance winners.  They
    // remain visible in the all-offers view, but an in-stock row is always
    // presented first unless the caller explicitly filters availability.
    if (sort.by === "price" || sort.by === "relevance") {
      const availability = availabilityRank(left) - availabilityRank(right);
      if (availability) return availability;
    }
    let primary = 0;
    switch (sort.by) {
      case "price":
        primary = priceCompare(left, right);
        break;
      case "updated":
        primary = timestamp(left.lastSeenAt) - timestamp(right.lastSeenAt);
        break;
      case "merchant":
        primary = compareText(left.merchantName, right.merchantName);
        break;
      case "product":
        primary = compareText(left.productName, right.productName);
        break;
      case "availability":
        primary = availabilityRank(left) - availabilityRank(right);
        break;
      case "relevance":
        primary =
          relevanceScore(left, sort.query) - relevanceScore(right, sort.query);
        break;
    }
    if (primary) return primary * sign;

    const seen = timestamp(right.lastSeenAt) - timestamp(left.lastSeenAt);
    if (seen) return seen;
    return compareText(left.id, right.id);
  });
}

export const sortOffers = sortChannelOffers;

export type RankChannelOffersOptions = {
  now?: Date;
  dedupe?: boolean;
};

/** Apply dedupe, filters, deterministic sort and bounded offset pagination. */
export function rankChannelOffers(
  offers: readonly ChannelOffer[],
  input: Partial<ChannelOfferFilters> | unknown = {},
  options: RankChannelOffersOptions = {},
): ChannelOffer[] {
  const filters = parseChannelOfferFilters(input);
  const source =
    options.dedupe === false
      ? [...offers]
      : dedupeChannelOffers(offers, { now: options.now });
  const filtered = filterChannelOffers(source, filters);
  const sorted = sortChannelOffers(filtered, {
    by: filters.sort,
    direction: filters.direction,
    query: filters.query,
  });
  return sorted.slice(filters.offset, filters.offset + filters.limit);
}

export function selectLowestAvailableOffer(
  offers: readonly ChannelOffer[],
  options: OfferAvailabilityOptions & { currency?: string } = {},
): ChannelOffer | undefined {
  const eligible = offers.filter((offer) => {
    if (options.currency && offer.currency !== options.currency.toUpperCase()) {
      return false;
    }
    return isOfferEligibleForLowestPrice(offer, options);
  });
  return sortChannelOffers(eligible, "price_asc")[0];
}

function maxSeenAt(offers: readonly ChannelOffer[]): string | undefined {
  return offers.reduce<string | undefined>((latest, offer) => {
    if (!latest || timestamp(offer.lastSeenAt) > timestamp(latest)) {
      return offer.lastSeenAt;
    }
    return latest;
  }, undefined);
}

/** Build canonical-product rows for the standard-product view. */
export function buildChannelProductSummaries(
  offers: readonly ChannelOffer[],
  options: { now?: Date; products?: readonly ChannelProduct[] } = {},
): ChannelProductSummary[] {
  const productsById = new Map<string, ChannelProduct>();
  for (const product of options.products ?? []) {
    if (!productsById.has(product.id)) productsById.set(product.id, product);
  }
  const deduped = dedupeChannelOffers(offers, { now: options.now });
  const groups = new Map<string, ChannelOffer[]>();
  for (const offer of deduped) {
    const group = groups.get(offer.productId) ?? [];
    group.push(offer);
    groups.set(offer.productId, group);
  }
  const summaries = [...groups.entries()].map(([productId, group]) => {
    const first = group[0];
    const metadata = productsById.get(productId);
    const available = group.filter((offer) =>
      isOfferAvailable(offer, { now: options.now }),
    );
    const lowest = selectLowestAvailableOffer(group, { now: options.now });
    return {
      productId,
      productName: metadata?.name ?? first.productName,
      platform: metadata?.platform ?? first.platform,
      productType: metadata?.productType ?? first.productType,
      offerCount: group.length,
      availableOfferCount: available.length,
      merchantCount: new Set(available.map((offer) => offer.merchantId)).size,
      lowestPriceMinor: lowest?.priceMinor ?? undefined,
      lowestCurrency: lowest?.currency,
      lowestOfferId: lowest?.id,
      lowestAvailableOffer: lowest,
      lastSeenAt: maxSeenAt(group),
    } satisfies ChannelProductSummary;
  });
  return summaries.sort((left, right) => {
    const leftMissing =
      left.lowestPriceMinor === undefined || left.lowestPriceMinor === null
        ? 1
        : 0;
    const rightMissing =
      right.lowestPriceMinor === undefined || right.lowestPriceMinor === null
        ? 1
        : 0;
    if (leftMissing !== rightMissing) return leftMissing - rightMissing;
    if (
      left.lowestPriceMinor !== undefined &&
      left.lowestPriceMinor !== null &&
      right.lowestPriceMinor !== undefined &&
      right.lowestPriceMinor !== null
    ) {
      const currency = compareText(left.lowestCurrency, right.lowestCurrency);
      if (currency) return currency;
      if (left.lowestPriceMinor !== right.lowestPriceMinor) {
        return left.lowestPriceMinor - right.lowestPriceMinor;
      }
    }
    return (
      compareText(left.productName, right.productName) ||
      compareText(left.productId, right.productId)
    );
  });
}

export const buildProductSummaries = buildChannelProductSummaries;

/** Build explainable merchant metrics; commercial relation is not a ranking input. */
export function buildChannelMerchantSummaries(
  offers: readonly ChannelOffer[],
  options: { now?: Date } = {},
): ChannelMerchantSummary[] {
  const deduped = dedupeChannelOffers(offers, { now: options.now });
  const byProduct = new Map<string, ChannelOffer[]>();
  for (const offer of deduped) {
    const group = byProduct.get(offer.productId) ?? [];
    group.push(offer);
    byProduct.set(offer.productId, group);
  }
  const lowestIds = new Set<string>();
  const topFiveIds = new Set<string>();
  for (const group of byProduct.values()) {
    const eligible = group.filter((offer) =>
      isOfferEligibleForLowestPrice(offer, { now: options.now }),
    );
    const lowest = selectLowestAvailableOffer(group, { now: options.now });
    if (lowest) lowestIds.add(lowest.id);
    for (const offer of sortChannelOffers(eligible, "price_asc").slice(0, 5)) {
      topFiveIds.add(offer.id);
    }
  }
  const groups = new Map<string, ChannelOffer[]>();
  for (const offer of deduped) {
    const group = groups.get(offer.merchantId) ?? [];
    group.push(offer);
    groups.set(offer.merchantId, group);
  }
  return [...groups.entries()]
    .map(([merchantId, group]) => {
      const available = group.filter((offer) =>
        isOfferAvailable(offer, { now: options.now }),
      );
      return {
        merchantId,
        merchantName: group[0].merchantName,
        offerCount: group.length,
        availableOfferCount: available.length,
        productCount: new Set(group.map((offer) => offer.productId)).size,
        lowestPriceHits: group.filter((offer) => lowestIds.has(offer.id))
          .length,
        topFiveHits: group.filter((offer) => topFiveIds.has(offer.id)).length,
        lastSeenAt: maxSeenAt(group),
      } satisfies ChannelMerchantSummary;
    })
    .sort(
      (left, right) =>
        right.lowestPriceHits - left.lowestPriceHits ||
        right.topFiveHits - left.topFiveHits ||
        right.availableOfferCount - left.availableOfferCount ||
        compareText(left.merchantName, right.merchantName) ||
        compareText(left.merchantId, right.merchantId),
    );
}

export const buildMerchantSummaries = buildChannelMerchantSummaries;
