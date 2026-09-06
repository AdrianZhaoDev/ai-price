import { z } from "zod";
import { isSafePublicHttpUrl } from "@/lib/public-data/urls";

/**
 * Types used by the read-only API-transit domain.
 *
 * These types intentionally do not import the application's pricing tables.
 * A transit station is a service that exposes an API; it is not a provider,
 * product, or plan in the official-price catalogue.  Keeping the boundary
 * explicit prevents a third-party station from silently entering the official
 * price rankings.
 */

export const TRANSIT_SOURCE_POLICY_VERSION = "transit-policy-v1";

export const TRANSIT_STATION_STATUSES = [
  "active",
  "limited",
  "unavailable",
  "unknown",
] as const;
export type TransitStationStatus = (typeof TRANSIT_STATION_STATUSES)[number];

export const TRANSIT_DATA_STATUSES = [
  "sample",
  "pending_review",
  "verified",
  "unpublished",
] as const;
export type TransitDataStatus = (typeof TRANSIT_DATA_STATUSES)[number];

export const TRANSIT_SOURCE_TYPES = [
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
export type TransitSourceType = (typeof TRANSIT_SOURCE_TYPES)[number];

export const TRANSIT_COMMERCIAL_RELATIONS = [
  "none",
  "listed",
  "partner",
  "affiliate",
  "sponsored",
  "unknown",
] as const;
export type TransitCommercialRelation =
  (typeof TRANSIT_COMMERCIAL_RELATIONS)[number];

export const TRANSIT_OPERATOR_TYPES = [
  "company",
  "individual",
  "unknown",
] as const;
export type TransitOperatorType = (typeof TRANSIT_OPERATOR_TYPES)[number];

export const TRANSIT_STATION_SYSTEMS = [
  "new_api",
  "sub_to_api",
  "custom",
  "unknown",
] as const;
export type TransitStationSystem = (typeof TRANSIT_STATION_SYSTEMS)[number];

export const TRANSIT_CHANNEL_TYPES = [
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
export type TransitChannelType = (typeof TRANSIT_CHANNEL_TYPES)[number];

export const TRANSIT_ACCOUNT_POOLS = [
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
export type TransitAccountPool = (typeof TRANSIT_ACCOUNT_POOLS)[number];

export const TRANSIT_RISK_LABELS = [
  "sample_data",
  "insufficient_samples",
  "mixed_pool",
  "reseller",
  "undisclosed_upstream",
  "third_party_aggregate",
  "pending_feedback",
] as const;
export type TransitRiskLabel = (typeof TRANSIT_RISK_LABELS)[number];

export const TRANSIT_USAGE_ADVICE = [
  "try_small",
  "cautious",
  "not_recommended",
  "pending",
] as const;
export type TransitUsageAdvice = (typeof TRANSIT_USAGE_ADVICE)[number];

export const TRANSIT_AVAILABILITY_SOURCE_TYPES = [
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
export type TransitAvailabilitySourceType =
  (typeof TRANSIT_AVAILABILITY_SOURCE_TYPES)[number];

export const TRANSIT_AVAILABILITY_SCOPES = [
  "station",
  "group",
  "model",
  "offer",
] as const;
export type TransitAvailabilityScope =
  (typeof TRANSIT_AVAILABILITY_SCOPES)[number];

export const TRANSIT_AVAILABILITY_MATCH_LEVELS = [
  "exact",
  "group",
  "model",
  "family",
  "station",
  "unknown",
] as const;
export type TransitAvailabilityMatchLevel =
  (typeof TRANSIT_AVAILABILITY_MATCH_LEVELS)[number];

export const TRANSIT_BILLING_MODES = ["token", "per_request", "fixed"] as const;
export type TransitBillingMode = (typeof TRANSIT_BILLING_MODES)[number];

export const TRANSIT_SORT_KEYS = [
  "overall",
  "rate",
  "stability",
  "updated",
  "name",
] as const;
export type TransitSortKey = (typeof TRANSIT_SORT_KEYS)[number];

export const TRANSIT_ORIGINS = ["database", "synthetic_fixture"] as const;
export type TransitDataOrigin = (typeof TRANSIT_ORIGINS)[number];

export const TRANSIT_FALLBACK_REASONS = [
  "no_database_loader",
  "database_loader_unconfigured",
  "database_unavailable",
  "database_empty",
  "database_invalid",
] as const;
export type TransitFallbackReason = (typeof TRANSIT_FALLBACK_REASONS)[number];

const finiteNonNegative = z.number().finite().nonnegative();
const nullableFiniteNonNegative = finiteNonNegative.nullable();
const isoDate = z.string().datetime({ offset: true });
const nullableIsoDate = isoDate.nullable();
const slug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "Invalid slug");
const shortText = (max = 500) => z.string().trim().min(1).max(max);
const publicUrl = z.string().trim().max(2048).refine(isSafePublicHttpUrl, {
  message: "Expected a safe public http(s) URL.",
});

export const transitStationStatusSchema = z.enum(TRANSIT_STATION_STATUSES);
export const transitDataStatusSchema = z.enum(TRANSIT_DATA_STATUSES);
export const transitSourceTypeSchema = z.enum(TRANSIT_SOURCE_TYPES);
export const transitCommercialRelationSchema = z.enum(
  TRANSIT_COMMERCIAL_RELATIONS,
);
export const transitOperatorTypeSchema = z.enum(TRANSIT_OPERATOR_TYPES);
export const transitStationSystemSchema = z.enum(TRANSIT_STATION_SYSTEMS);
export const transitChannelTypeSchema = z.enum(TRANSIT_CHANNEL_TYPES);
export const transitAccountPoolSchema = z.enum(TRANSIT_ACCOUNT_POOLS);
export const transitRiskLabelSchema = z.enum(TRANSIT_RISK_LABELS);
export const transitUsageAdviceSchema = z.enum(TRANSIT_USAGE_ADVICE);
export const transitAvailabilitySourceTypeSchema = z.enum(
  TRANSIT_AVAILABILITY_SOURCE_TYPES,
);
export const transitAvailabilityScopeSchema = z.enum(
  TRANSIT_AVAILABILITY_SCOPES,
);
export const transitAvailabilityMatchLevelSchema = z.enum(
  TRANSIT_AVAILABILITY_MATCH_LEVELS,
);
export const transitBillingModeSchema = z.enum(TRANSIT_BILLING_MODES);
export const transitSortKeySchema = z.enum(TRANSIT_SORT_KEYS);
export const transitDataOriginSchema = z.enum(TRANSIT_ORIGINS);
export const transitFallbackReasonSchema = z.enum(TRANSIT_FALLBACK_REASONS);

export const transitAvailabilitySchema = z
  .object({
    sevenDayRate: z.number().finite().min(0).max(1).nullable(),
    sevenDaySamples: z.number().int().nonnegative().max(100_000),
    firstCheckedAt: nullableIsoDate,
    lastCheckedAt: nullableIsoDate,
    latestLatencyMs: nullableFiniteNonNegative,
    averageLatency7dMs: nullableFiniteNonNegative,
    note: z.string().trim().max(500).nullable(),
    sourceType: transitAvailabilitySourceTypeSchema,
    sourceLabel: z.string().trim().max(200).nullable(),
    sourceUrl: publicUrl.nullable(),
    scope: transitAvailabilityScopeSchema.nullable(),
    matchLevel: transitAvailabilityMatchLevelSchema.nullable(),
    monitoringScopeId: z.string().trim().max(200).nullable(),
    recentSamples: z
      .array(
        z.object({
          ok: z.boolean(),
          checkedAt: nullableIsoDate,
          latencyMs: nullableFiniteNonNegative,
        }),
      )
      .max(100)
      .default([]),
  })
  .strict();
export type TransitAvailability = z.infer<typeof transitAvailabilitySchema>;

export const transitOfferSchema = z
  .object({
    id: shortText(160),
    stationId: shortText(160),
    family: shortText(40),
    standardModelId: shortText(160),
    standardModelLabel: shortText(160),
    /** Source-schema alias retained for a DB adapter that uses `standardModel`. */
    standardModel: shortText(160).optional(),
    groupName: shortText(160),
    billingMode: transitBillingModeSchema,
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/),
    rechargeRatioRaw: z.string().trim().max(100).nullable(),
    rechargeRatio: nullableFiniteNonNegative.optional(),
    /** Paid CNY per one station quota CNY; see calculateRechargeCoefficient. */
    rechargeCoefficient: nullableFiniteNonNegative,
    modelMultiplier: nullableFiniteNonNegative,
    stationGroupMultiplier: nullableFiniteNonNegative,
    combinedRate: nullableFiniteNonNegative,
    combinedMultiplier: nullableFiniteNonNegative.optional(),
    inputPrice: nullableFiniteNonNegative,
    outputPrice: nullableFiniteNonNegative,
    cacheReadPrice: nullableFiniteNonNegative,
    cacheWritePrice: nullableFiniteNonNegative,
    imageOutputPrice: nullableFiniteNonNegative,
    fixedPrice: nullableFiniteNonNegative,
    fixedPriceUnit: z.string().trim().max(100).nullable(),
    fixedPriceCurrency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    accountPool: transitAccountPoolSchema,
    channelType: transitChannelTypeSchema,
    priceSourceUrl: publicUrl.nullable(),
    priceSourceLabel: z.string().trim().max(200).nullable(),
    lastVerifiedAt: nullableIsoDate,
    availability: transitAvailabilitySchema,
    status: z
      .enum(["verified", "pending_review", "unavailable", "unknown"])
      .optional(),
  })
  .strict();
export type TransitOffer = z.infer<typeof transitOfferSchema>;

export const transitStationSchema = z
  .object({
    id: shortText(160),
    slug,
    name: shortText(200),
    websiteUrl: publicUrl,
    apiBaseUrl: publicUrl.nullable(),
    monitorUrl: publicUrl.nullable(),
    stationSystem: transitStationSystemSchema,
    operatorType: transitOperatorTypeSchema,
    status: transitStationStatusSchema,
    sourceType: transitSourceTypeSchema,
    commercialRelation: transitCommercialRelationSchema,
    summary: z.string().trim().max(1_000),
    channelTypes: z.array(transitChannelTypeSchema).max(30),
    accountPools: z.array(transitAccountPoolSchema).max(30),
    paymentMethods: z.array(z.string().trim().min(1).max(80)).max(30),
    minimumTopUp: z.string().trim().max(100).nullable(),
    balanceExpiry: z.string().trim().max(100).nullable(),
    riskLabels: z.array(transitRiskLabelSchema).max(30),
    usageAdvice: transitUsageAdviceSchema,
    usageAdviceTags: z
      .array(z.string().trim().min(1).max(80))
      .max(30)
      .optional(),
    lastUpdatedAt: isoDate,
    lastCollectedAt: nullableIsoDate.optional(),
    dataStatus: transitDataStatusSchema,
    availability: transitAvailabilitySchema,
    sourceUrl: publicUrl.nullable(),
    sourceLabel: z.string().trim().max(200).nullable(),
    offers: z.array(transitOfferSchema).max(2_000),
    /** Compatibility alias for consumers that call offers "prices". */
    prices: z.array(transitOfferSchema).max(2_000),
    synthetic: z.boolean(),
  })
  .strict();
export type TransitStation = z.infer<typeof transitStationSchema>;

export const transitReadModelSchema = z
  .object({
    generationId: shortText(200),
    generatedAt: isoDate,
    sourcePolicyVersion: shortText(80),
    origin: transitDataOriginSchema,
    dataSource: transitDataOriginSchema.optional(),
    isSynthetic: z.boolean(),
    degraded: z.boolean(),
    dataStatus: z.enum(["sample", "pending_review", "verified", "degraded"]),
    fallbackReason: transitFallbackReasonSchema.nullable(),
    warning: z.string().trim().max(500).optional(),
    stations: z.array(transitStationSchema).max(20_000),
  })
  .strict();
export type TransitReadModel = z.infer<typeof transitReadModelSchema>;

export const transitListQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    family: z.string().trim().min(1).max(40).optional(),
    model: z.string().trim().max(160).optional(),
    channel: transitChannelTypeSchema.optional(),
    pool: transitAccountPoolSchema.optional(),
    risk: transitRiskLabelSchema.optional(),
    sort: transitSortKeySchema.default("overall"),
    limit: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : value,
        z.number().finite().int().min(1).max(50),
      )
      .default(20),
    cursor: z.string().trim().max(200).optional(),
    includeUnpublished: z
      .preprocess((value) => {
        if (typeof value !== "string") return value;
        if (value.trim().toLowerCase() === "true") return true;
        if (value.trim().toLowerCase() === "false") return false;
        return value;
      }, z.boolean())
      .default(false),
  })
  .strict();
export type TransitListQuery = z.infer<typeof transitListQuerySchema>;

export type TransitListResult = {
  items: TransitStation[];
  /** Alias retained for callers that use station terminology. */
  stations: TransitStation[];
  total: number;
  nextCursor: string | null;
  generatedAt: string;
  generationId: string;
  sourcePolicyVersion: string;
  origin: TransitDataOrigin;
  isSynthetic: boolean;
  degraded: boolean;
  dataStatus: TransitReadModel["dataStatus"];
  fallbackReason: TransitFallbackReason | null;
  dataSource?: TransitDataOrigin;
  warning?: string;
  query: TransitListQuery;
};

export type TransitDatabaseSnapshotInput = {
  generationId?: string | null;
  generatedAt?: string | Date | null;
  dataStatus?: TransitDataStatus | "degraded" | null;
  stations?: unknown[] | null;
  offers?: unknown[] | null;
  availabilitySamples?: unknown[] | null;
};

export type TransitLoadContext = {
  domain: "transit";
  signal?: AbortSignal;
};

export type TransitDatabaseLoader = (
  context: TransitLoadContext,
) => Promise<unknown> | unknown;

export type TransitRepositoryOptions = {
  /** A loader supplied by the database layer; no schema import is required. */
  databaseLoader?: TransitDatabaseLoader;
  /** Short alias for dependency-injection containers. */
  loader?: TransitDatabaseLoader;
  /** Alias accepted to make dependency injection convenient in route tests. */
  loadFromDatabase?: TransitDatabaseLoader;
  /** A loader object can expose `load` or `loadTransitSnapshot`. */
  database?:
    | TransitDatabaseLoader
    | object
    | {
        load?: TransitDatabaseLoader;
        loadTransitSnapshot?: TransitDatabaseLoader;
      };
  /** Alias for a future Drizzle adapter wrapper. */
  db?: TransitDatabaseLoader;
  /** Explicit flag for tests/containers that know a DB is configured. */
  databaseConfigured?: boolean;
  fixture?: readonly TransitStation[];
  now?: () => Date;
  cacheTtlMs?: number;
  sourcePolicyVersion?: string;
  /** Set false for a production route that must never expose local fixtures. */
  allowSyntheticFixture?: boolean;
};

export type TransitRepositoryLoadOptions = {
  forceRefresh?: boolean;
  signal?: AbortSignal;
};

export type TransitRepositoryListOptions = TransitRepositoryLoadOptions & {
  includeUnpublished?: boolean;
};

export function isTransitStationPublic(
  station: Pick<TransitStation, "status" | "dataStatus">,
  options: { includeSample?: boolean; includeUnpublished?: boolean } = {},
): boolean {
  if (options.includeUnpublished) return true;
  // A reviewed price catalogue can be public without claiming measured uptime.
  if (station.status === "unavailable") return false;
  if (station.dataStatus === "verified") return true;
  return options.includeSample === true && station.dataStatus === "sample";
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
