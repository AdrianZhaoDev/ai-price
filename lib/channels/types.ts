import { z } from "zod";
import { isSafePublicHttpUrl } from "@/lib/public-data/urls";

/**
 * The channels domain is intentionally independent from the official pricing
 * tables.  These values describe a public, normalized offer from a merchant
 * source; they are not a claim that the merchant is safe or endorsed.
 */
export const channelAvailabilityStatuses = [
  "in_stock",
  "out_of_stock",
  "unknown",
  "expired",
  "unavailable",
] as const;

export type ChannelAvailabilityStatus =
  (typeof channelAvailabilityStatuses)[number];

export const channelSourceTypes = [
  "public_page",
  "public_api",
  "authorized_feed",
  "merchant_submission",
  "manual_snapshot",
] as const;

export type ChannelSourceType = (typeof channelSourceTypes)[number];

export const channelSourceHealthStatuses = [
  "healthy",
  "unknown",
  "degraded",
  "failed",
] as const;

export type ChannelSourceHealth = (typeof channelSourceHealthStatuses)[number];

export const channelPublicationStatuses = [
  "draft",
  "pending_review",
  "verified",
  "published",
  "rejected",
  "suspended",
] as const;

export type ChannelPublicationStatus =
  (typeof channelPublicationStatuses)[number];

export const channelMerchantStatuses = [
  "active",
  "pending_review",
  "suspended",
  "closed",
] as const;

export type ChannelMerchantStatus = (typeof channelMerchantStatuses)[number];

export const channelSorts = [
  "price",
  "price_asc",
  "price_desc",
  "updated",
  "updated_desc",
  "merchant",
  "product",
  "availability",
  "relevance",
] as const;

export type ChannelSort = (typeof channelSorts)[number];

const maxSafeInteger = Number.MAX_SAFE_INTEGER;

const dateString = z.preprocess(
  (value) => {
    if (!(value instanceof Date)) return value;
    return Number.isFinite(value.getTime()) ? value.toISOString() : value;
  },
  z.string().refine((value) => Number.isFinite(Date.parse(value)), {
    message: "Expected a valid date or ISO date string.",
  }),
);

const nullableDateString = dateString.nullable().optional();

const urlString = z.preprocess(
  (value) => (value instanceof URL ? value.toString() : value),
  z.string().trim().max(2048).refine(isSafePublicHttpUrl, {
    message: "Expected a safe public http(s) URL.",
  }),
);

const boundedString = (max: number) => z.string().trim().min(1).max(max);

const optionalBoundedString = (max: number) => boundedString(max).optional();

const nonNegativeInteger = z.preprocess((value) => {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().finite().int().min(0).max(maxSafeInteger));

const positiveInteger = z.preprocess((value) => {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().finite().int().min(1).max(maxSafeInteger));

const boundedLimit = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().finite().int().min(1).max(100));

const boundedOffset = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().finite().int().min(0).max(10_000));

const confidence = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().finite().min(0).max(1));

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be an ISO 4217 code.");

const stringArray = z.array(boundedString(80)).max(64);

const recordValue = z.record(z.string(), z.unknown());

export const channelPriceTierSchema = z.object({
  minQuantity: positiveInteger,
  priceMinor: nonNegativeInteger,
  currency,
});

export type ChannelPriceTier = z.infer<typeof channelPriceTierSchema>;

const canonicalAvailability = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, ChannelAvailabilityStatus> = {
    available: "in_stock",
    in_stock: "in_stock",
    instock: "in_stock",
    stock: "in_stock",
    sold_out: "out_of_stock",
    out_of_stock: "out_of_stock",
    outofstock: "out_of_stock",
    unavailable: "unavailable",
    disabled: "unavailable",
    expired: "expired",
    unknown: "unknown",
  };
  return aliases[normalized] ?? normalized;
};

const canonicalSourceType = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, ChannelSourceType> = {
    page: "public_page",
    public_page: "public_page",
    official_page: "public_page",
    api: "public_api",
    public_api: "public_api",
    feed: "authorized_feed",
    authorized_feed: "authorized_feed",
    submission: "merchant_submission",
    merchant_submission: "merchant_submission",
    manual: "manual_snapshot",
    manual_snapshot: "manual_snapshot",
  };
  return aliases[normalized] ?? normalized;
};

const canonicalSourceHealth = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "ok" || normalized === "healthy") return "healthy";
  if (normalized === "stale" || normalized === "degraded") return "degraded";
  if (normalized === "error" || normalized === "failed") return "failed";
  return normalized;
};

const canonicalPublicationStatus = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "pending") return "pending_review";
  if (normalized === "active") return "published";
  return normalized;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function booleanFrom(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function normalizeTierRows(value: unknown, fallbackCurrency: unknown): unknown {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!isRecord(item)) return item;
    return {
      ...item,
      minQuantity: firstDefined(
        item.minQuantity,
        item.min_quantity,
        item.minOrderQuantity,
        item.min_order_quantity,
        item.quantity,
      ),
      priceMinor: firstDefined(
        item.priceMinor,
        item.price_minor,
        item.amountMinor,
        item.amount_minor,
        item.price,
      ),
      currency: firstDefined(
        item.currency,
        item.currencyCode,
        item.currency_code,
        fallbackCurrency,
      ),
    };
  });
}

/**
 * Adapt rows from a future Drizzle reader (which may expose snake_case
 * columns) without coupling this module to a particular database schema.
 */
export function normalizeChannelOfferInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const nestedOffer = isRecord(input.channelPublicOffer)
    ? input.channelPublicOffer
    : isRecord(input.channel_public_offer)
      ? input.channel_public_offer
      : undefined;
  const value: Record<string, unknown> = {
    ...(nestedOffer ?? {}),
    ...input,
  };
  const merchant = isRecord(value.merchant) ? value.merchant : undefined;
  const product = isRecord(value.product) ? value.product : undefined;
  const source = isRecord(value.source) ? value.source : undefined;
  const price = isRecord(value.price) ? value.price : undefined;

  value.id = firstDefined(value.id, value.offerId, value.offer_id);
  value.merchantId = firstDefined(
    value.merchantId,
    value.merchant_id,
    merchant?.id,
  );
  value.merchantName = firstDefined(
    value.merchantName,
    value.merchant_name,
    merchant?.name,
    value.merchantId,
  );
  value.productId = firstDefined(
    value.productId,
    value.product_id,
    value.canonicalProductId,
    value.canonical_product_id,
    product?.id,
  );
  value.productName = firstDefined(
    value.productName,
    value.product_name,
    value.canonicalProductName,
    value.canonical_product_name,
    product?.name,
    product?.displayName,
    product?.display_name,
    value.rawTitle,
    value.raw_title,
    value.title,
    value.productId,
  );
  value.platform = firstDefined(value.platform, product?.platform);
  value.productType = firstDefined(
    value.productType,
    value.product_type,
    product?.productType,
    product?.product_type,
  );
  value.specification = firstDefined(
    value.specification,
    value.spec,
    product?.specification,
  );
  value.rawTitle = firstDefined(
    value.rawTitle,
    value.raw_title,
    value.title,
    value.productName,
  );
  value.sourceId = firstDefined(
    value.sourceId,
    value.source_id,
    value.channelSourceId,
    value.channel_source_id,
    source?.id,
    value.sourceName,
    value.source_name,
    `${String(value.merchantId ?? "merchant")}:${String(value.productId ?? "product")}`,
  );
  value.sourceType = canonicalSourceType(
    firstDefined(
      value.sourceType,
      value.source_type,
      source?.type,
      "public_page",
    ),
  );
  value.sourceUrl = firstDefined(
    value.sourceUrl,
    value.source_url,
    source?.url,
    value.offerUrl,
    value.offer_url,
  );
  value.offerUrl = firstDefined(
    value.offerUrl,
    value.offer_url,
    value.url,
    value.link,
    value.sourceUrl,
  );
  const hasPriceField = [
    "priceMinor",
    "price_minor",
    "amountMinor",
    "amount_minor",
    "price",
  ].some((key) => key in value);
  const resolvedPrice = firstDefined(
    value.priceMinor,
    value.price_minor,
    value.amountMinor,
    value.amount_minor,
    price?.priceMinor,
    price?.amountMinor,
    value.price,
  );
  value.priceMinor =
    resolvedPrice === undefined && hasPriceField ? null : resolvedPrice;
  value.currency = firstDefined(
    value.currency,
    value.currencyCode,
    value.currency_code,
    price?.currency,
    "CNY",
  );
  value.availabilityStatus = canonicalAvailability(
    firstDefined(
      value.availabilityStatus,
      value.availability_status,
      value.availability,
      value.stockStatus,
      value.stock_status,
      "unknown",
    ),
  );
  value.stockQuantity = firstDefined(
    value.stockQuantity,
    value.stock_quantity,
    value.stockCount,
    value.stock_count,
    value.inventory,
  );
  value.minPurchaseQuantity = firstDefined(
    value.minPurchaseQuantity,
    value.min_purchase_quantity,
    value.minOrderQuantity,
    value.min_order_quantity,
    value.minimumQuantity,
    value.minimum_quantity,
  );
  const rawTiers = firstDefined(
    value.tiers,
    value.priceTiers,
    value.price_tiers,
    value.bulkPricingTiers,
    value.bulk_pricing_tiers,
    [],
  );
  value.tiers = normalizeTierRows(rawTiers, value.currency);
  value.labels = firstDefined(value.labels, value.tags, []);
  value.riskLabels = firstDefined(
    value.riskLabels,
    value.risk_labels,
    value.risks,
    [],
  );
  value.expiresAt = firstDefined(
    value.expiresAt,
    value.expires_at,
    value.validUntil,
    value.valid_until,
    null,
  );
  value.observedAt = firstDefined(
    value.observedAt,
    value.observed_at,
    value.checkedAt,
    value.checked_at,
    value.lastSeenAt,
    value.last_seen_at,
    value.createdAt,
    value.created_at,
  );
  value.firstSeenAt = firstDefined(
    value.firstSeenAt,
    value.first_seen_at,
    value.observedAt,
    value.createdAt,
    value.created_at,
  );
  value.lastSeenAt = firstDefined(
    value.lastSeenAt,
    value.last_seen_at,
    value.observedAt,
  );
  value.publicDedupeKey = firstDefined(
    value.publicDedupeKey,
    value.public_dedupe_key,
    value.dedupeKey,
    value.dedupe_key,
    [value.merchantId, value.productId, value.sourceId, value.offerUrl]
      .filter(Boolean)
      .join("|"),
    value.id,
  );
  value.classificationConfidence = firstDefined(
    value.classificationConfidence,
    value.classification_confidence,
    value.confidence,
    1,
  );
  value.sourceHealth = canonicalSourceHealth(
    firstDefined(
      value.sourceHealth,
      value.source_health,
      source?.health,
      "unknown",
    ),
  );
  value.accessMode = firstDefined(
    value.accessMode,
    value.access_mode,
    "public",
  );
  value.publicationStatus = canonicalPublicationStatus(
    firstDefined(
      value.publicationStatus,
      value.publication_status,
      value.status,
      "published",
    ),
  );
  value.published =
    booleanFrom(value.published) ??
    (value.publicationStatus === "published" ||
      value.publicationStatus === "verified");
  value.synthetic = booleanFrom(value.synthetic) ?? false;
  return value;
}

const channelOfferObjectSchema = z.object({
  id: boundedString(160),
  merchantId: boundedString(120),
  merchantName: boundedString(160),
  productId: boundedString(160),
  productName: boundedString(240),
  platform: optionalBoundedString(80),
  productType: optionalBoundedString(80),
  specification: z.union([boundedString(240), recordValue]).optional(),
  rawTitle: boundedString(320),
  sourceId: boundedString(160),
  sourceType: z.enum(channelSourceTypes),
  sourceUrl: urlString.optional(),
  offerUrl: urlString,
  /** Null means the source exposed an offer but no comparable amount. */
  priceMinor: nonNegativeInteger.nullable(),
  currency,
  availabilityStatus: z.enum(channelAvailabilityStatuses),
  stockQuantity: nonNegativeInteger.nullable().optional(),
  minPurchaseQuantity: positiveInteger.nullable().optional(),
  tiers: z.array(channelPriceTierSchema).max(64).default([]),
  labels: stringArray.default([]),
  riskLabels: stringArray.default([]),
  expiresAt: nullableDateString,
  firstSeenAt: dateString,
  lastSeenAt: dateString,
  observedAt: dateString,
  publicDedupeKey: boundedString(320),
  classificationConfidence: confidence.default(1),
  sourceHealth: z.enum(channelSourceHealthStatuses).default("unknown"),
  accessMode: z.enum(["public", "authorized", "submission"]).default("public"),
  publicationStatus: z.enum(channelPublicationStatuses).default("published"),
  published: z.boolean().default(true),
  synthetic: z.boolean().default(false),
  metadata: recordValue.optional(),
});

/** Canonical public offer contract used by the ranking and repository code. */
export const channelOfferSchema = z.preprocess(
  normalizeChannelOfferInput,
  channelOfferObjectSchema,
);

export type ChannelOffer = z.infer<typeof channelOfferObjectSchema>;

export type ChannelOfferInput = z.input<typeof channelOfferSchema>;

export function parseChannelOffer(input: unknown): ChannelOffer {
  return channelOfferSchema.parse(input);
}

export function validateChannelOffer(input: unknown):
  | {
      success: true;
      data: ChannelOffer;
    }
  | {
      success: false;
      error: z.ZodError;
    } {
  const result = channelOfferSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

export const channelOfferListSchema = z.array(channelOfferSchema).max(500_000);

export function parseChannelOfferList(input: unknown): ChannelOffer[] {
  return channelOfferListSchema.parse(input);
}

export function validateChannelOfferList(
  input: unknown,
):
  | { success: true; data: ChannelOffer[] }
  | { success: false; error: z.ZodError } {
  const result = channelOfferListSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

function normalizeChannelMerchantInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const value: Record<string, unknown> = { ...input };
  value.id = firstDefined(value.id, value.merchantId, value.merchant_id);
  value.slug = firstDefined(
    value.slug,
    value.merchantSlug,
    value.merchant_slug,
    value.id,
  );
  value.name = firstDefined(
    value.name,
    value.merchantName,
    value.merchant_name,
    value.slug,
  );
  value.websiteUrl = firstDefined(
    value.websiteUrl,
    value.website_url,
    value.url,
  );
  value.status = firstDefined(value.status, "active");
  value.operatorType = firstDefined(value.operatorType, value.operator_type);
  value.platforms = firstDefined(value.platforms, []);
  value.riskLabels = firstDefined(value.riskLabels, value.risk_labels, []);
  value.lastReviewedAt = firstDefined(
    value.lastReviewedAt,
    value.last_reviewed_at,
    value.latestSeenAt,
    value.latest_seen_at,
    null,
  );
  return value;
}

const channelMerchantObjectSchema = z.object({
  id: boundedString(120),
  slug: boundedString(120),
  name: boundedString(160),
  host: optionalBoundedString(160),
  websiteUrl: urlString.optional(),
  status: z.enum(channelMerchantStatuses).default("active"),
  operatorType: optionalBoundedString(80),
  platforms: stringArray.default([]),
  riskLabels: stringArray.default([]),
  lastReviewedAt: nullableDateString,
});

export const channelMerchantSchema = z.preprocess(
  normalizeChannelMerchantInput,
  channelMerchantObjectSchema,
);

export type ChannelMerchant = z.infer<typeof channelMerchantObjectSchema>;

export function parseChannelMerchant(input: unknown): ChannelMerchant {
  return channelMerchantSchema.parse(input);
}

function normalizeChannelProductInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const value: Record<string, unknown> = { ...input };
  value.id = firstDefined(value.id, value.productId, value.product_id);
  value.slug = firstDefined(
    value.slug,
    value.productSlug,
    value.product_slug,
    value.id,
  );
  value.name = firstDefined(
    value.name,
    value.displayName,
    value.display_name,
    value.productName,
    value.product_name,
    value.slug,
  );
  value.platform = firstDefined(value.platform, "unknown");
  value.productType = firstDefined(
    value.productType,
    value.product_type,
    "unknown",
  );
  value.specification = firstDefined(value.specification, value.spec, null);
  if (value.specification === null) value.specification = undefined;
  value.aliases = firstDefined(value.aliases, []);
  value.reviewStatus = firstDefined(
    value.reviewStatus,
    value.review_status,
    value.status,
    "published",
  );
  return value;
}

const channelProductObjectSchema = z.object({
  id: boundedString(160),
  slug: boundedString(160),
  name: boundedString(240),
  platform: optionalBoundedString(80),
  productType: optionalBoundedString(80),
  specification: z.union([boundedString(240), recordValue]).optional(),
  aliases: stringArray.default([]),
  reviewStatus: z
    .enum(["draft", "pending_review", "verified", "published", "suspended"])
    .default("published"),
});

export const channelProductSchema = z.preprocess(
  normalizeChannelProductInput,
  channelProductObjectSchema,
);

export type ChannelProduct = z.infer<typeof channelProductObjectSchema>;

export function parseChannelProduct(input: unknown): ChannelProduct {
  return channelProductSchema.parse(input);
}

const normalizeFilterList = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const values = value
      .filter((item): item is string => typeof item === "string")
      .flatMap((item) => item.split(","))
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length ? [...new Set(values)].slice(0, 100) : undefined;
  }
  if (typeof value === "string") {
    const values = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length ? [...new Set(values)].slice(0, 100) : undefined;
  }
  return undefined;
};

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return fallback;
}

function parseFilterInteger(value: unknown): unknown {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}

function normalizeFilterInput(input: unknown): unknown {
  if (input instanceof URLSearchParams) {
    const record: Record<string, unknown> = {};
    input.forEach((value, key) => {
      const previous = record[key];
      record[key] =
        previous === undefined
          ? value
          : Array.isArray(previous)
            ? [...previous, value]
            : [previous, value];
    });
    return normalizeFilterInput(record);
  }
  if (!isRecord(input)) return {};
  const value: Record<string, unknown> = { ...input };
  value.query = firstDefined(value.query, value.q, value.search);
  value.merchantIds = normalizeFilterList(
    firstDefined(
      value.merchantIds,
      value.merchant_ids,
      value.merchantId,
      value.merchant,
    ),
  );
  value.productIds = normalizeFilterList(
    firstDefined(
      value.productIds,
      value.product_ids,
      value.productId,
      value.product,
    ),
  );
  value.platforms = normalizeFilterList(value.platforms ?? value.platform);
  value.productTypes = normalizeFilterList(
    value.productTypes ?? value.product_types ?? value.productType,
  );
  value.sourceTypes = normalizeFilterList(
    value.sourceTypes ?? value.source_types ?? value.sourceType,
  );
  const requestedAvailability = firstDefined(
    value.availability,
    value.availabilityStatus,
    value.availability_status,
  );
  value.availability =
    requestedAvailability === "available"
      ? "in_stock"
      : canonicalAvailability(requestedAvailability);
  value.minPriceMinor = parseFilterInteger(
    firstDefined(value.minPriceMinor, value.min_price_minor, value.priceMin),
  );
  value.maxPriceMinor = parseFilterInteger(
    firstDefined(value.maxPriceMinor, value.max_price_minor, value.priceMax),
  );
  value.limit = parseFilterInteger(value.limit);
  value.offset = parseFilterInteger(value.offset);
  value.publishedOnly = parseBoolean(
    firstDefined(value.publishedOnly, value.published_only),
    true,
  );
  if (value.sort === "price_asc") value.sort = "price";
  if (value.sort === "updated_desc") value.sort = "updated";
  if (value.direction === undefined)
    value.direction =
      value.sort === "updated" || value.sort === "relevance" ? "desc" : "asc";
  for (const alias of [
    "q",
    "search",
    "merchant_ids",
    "merchantId",
    "merchant",
    "product_ids",
    "productId",
    "product",
    "platform",
    "product_types",
    "productType",
    "source_types",
    "sourceType",
    "availabilityStatus",
    "availability_status",
    "min_price_minor",
    "priceMin",
    "max_price_minor",
    "priceMax",
    "published_only",
  ])
    delete value[alias];
  return value;
}

export const channelOfferFiltersSchema = z.preprocess(
  normalizeFilterInput,
  z.strictObject({
    query: boundedString(120).optional(),
    merchantIds: z.array(boundedString(120)).max(100).optional(),
    productIds: z.array(boundedString(160)).max(100).optional(),
    platforms: z.array(boundedString(80)).max(100).optional(),
    productTypes: z.array(boundedString(80)).max(100).optional(),
    sourceTypes: z.array(z.enum(channelSourceTypes)).max(20).optional(),
    availability: z
      .enum(["all", ...channelAvailabilityStatuses] as const)
      .default("all"),
    minPriceMinor: nonNegativeInteger.optional(),
    maxPriceMinor: nonNegativeInteger.optional(),
    sourceHealth: z.enum(channelSourceHealthStatuses).optional(),
    publishedOnly: z.boolean().default(true),
    sort: z
      .enum([
        "price",
        "updated",
        "merchant",
        "product",
        "availability",
        "relevance",
      ] as const)
      .default("price"),
    direction: z.enum(["asc", "desc"] as const).default("asc"),
    limit: boundedLimit.default(50),
    offset: boundedOffset.default(0),
  }),
);

export type ChannelOfferFilters = z.infer<typeof channelOfferFiltersSchema>;

export function parseChannelOfferFilters(input: unknown): ChannelOfferFilters {
  const result = channelOfferFiltersSchema.safeParse(input ?? {});
  if (result.success) return result.data;
  return channelOfferFiltersSchema.parse({});
}

export type ChannelDataStatus =
  | "published"
  | "verified"
  | "sample"
  | "pending_review"
  | "stale"
  | "degraded"
  | "synthetic"
  | "empty";
export type ChannelDataSource =
  "database" | "injected" | "synthetic" | "synthetic_fixture";

export const channelFallbackReasons = [
  "no_database_loader",
  "database_loader_unconfigured",
  "database_unavailable",
  "database_empty",
  "database_invalid",
] as const;
export type ChannelFallbackReason = (typeof channelFallbackReasons)[number];

export type ChannelDataOrigin = "database" | "synthetic_fixture";

export type ChannelSnapshot = {
  domain: "channels";
  schemaVersion?: 1;
  generationId?: string;
  generatedAt: string;
  dataStatus: ChannelDataStatus;
  dataSource: ChannelDataSource;
  sourceCount?: number;
  sourcePolicyVersion?: string;
  origin?: ChannelDataOrigin;
  isSynthetic?: boolean;
  degraded?: boolean;
  fallbackReason?: ChannelFallbackReason | null;
  offers: ChannelOffer[];
  merchants?: ChannelMerchant[];
  products?: ChannelProduct[];
  warning?: string;
};

/** Compatibility name for route code that calls the snapshot a read model. */
export type ChannelReadModel = ChannelSnapshot;

export type ChannelProductSummary = {
  productId: string;
  productName: string;
  platform?: string;
  productType?: string;
  offerCount: number;
  availableOfferCount: number;
  merchantCount: number;
  lowestPriceMinor?: number;
  lowestCurrency?: string;
  multipleCurrencies?: boolean;
  lowestOfferId?: string;
  lowestAvailableOffer?: ChannelOffer;
  lastSeenAt?: string;
};

export type ChannelMerchantSummary = {
  merchantId: string;
  merchantName: string;
  offerCount: number;
  availableOfferCount: number;
  productCount: number;
  lowestPriceHits: number;
  topFiveHits: number;
  lastSeenAt?: string;
};

export type ChannelSortInput =
  | ChannelSort
  | {
      by?: ChannelSort;
      direction?: "asc" | "desc";
      query?: string;
    };

/** A narrow helper for callers that need to display a safe source label. */
export function channelDataStatusLabel(status: ChannelDataStatus): string {
  switch (status) {
    case "published":
      return "published";
    case "verified":
      return "verified";
    case "sample":
      return "sample";
    case "pending_review":
      return "pending review";
    case "synthetic":
      return "synthetic fixture";
    case "degraded":
      return "degraded fallback";
    case "stale":
      return "stale";
    case "empty":
      return "empty";
  }
}

// Keep this export available to tests and future adapters without exposing
// implementation details of the object schema itself.
export const channelOfferObject = channelOfferObjectSchema;
