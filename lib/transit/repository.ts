import {
  calculateCombinedRate,
  calculateRechargeCoefficient,
  filterTransitStations,
  isTransitOfferPublic,
  offerMatches,
  paginateTransitStations,
  parseTransitListQuery,
  sortTransitStations,
} from "@/lib/transit/ranking";
import {
  getPublicDataDatabase,
  isPublicDataDatabaseConfigured,
  type Database,
} from "@/lib/db/client";
import {
  publicDataGenerations,
  transitAvailabilitySamples,
  transitOffers,
  transitStations,
} from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";
import { isPrivateOrReservedHostname } from "@/lib/public-data/urls";
import {
  isTransitStationPublic,
  transitAvailabilitySchema,
  transitDataStatusSchema,
  transitOfferSchema,
  transitReadModelSchema,
  transitStationSchema,
  TRANSIT_SOURCE_POLICY_VERSION,
  TRANSIT_LIST_OFFER_LIMIT,
  type TransitAvailability,
  type TransitDatabaseLoader,
  type TransitDatabaseSnapshotInput,
  type TransitFallbackReason,
  type TransitListResult,
  type TransitLoadContext,
  type TransitOffer,
  type TransitReadModel,
  type TransitRepositoryListOptions,
  type TransitRepositoryLoadOptions,
  type TransitRepositoryOptions,
  type TransitSourceType,
  type TransitStation,
} from "@/lib/transit/types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function pick(record: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function number(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().replaceAll(",", "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function integer(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function dateString(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function urlString(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Public read models must never expose embedded credentials or obvious
    // loopback/private endpoints.  This is a data-boundary guard, not a
    // substitute for the SSRF restrictions required by future collectors.
    if (
      url.username ||
      url.password ||
      isPrivateOrReservedHostname(url.hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeSlug(value: unknown): string | null {
  const candidate = text(value)
    ?.toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return candidate && /^[a-z0-9][a-z0-9-]*$/i.test(candidate)
    ? candidate.slice(0, 100)
    : null;
}

function explicitOrDerivedSlug(
  row: UnknownRecord,
  name: string,
): string | null {
  const raw = text(pick(row, "slug", "stationSlug", "station_slug"));
  if (raw) {
    return /^[a-z0-9][a-z0-9-]*$/i.test(raw.trim())
      ? raw.trim().toLocaleLowerCase("en-US").slice(0, 100)
      : null;
  }
  return safeSlug(name);
}

function stableId(parts: readonly string[], prefix: string): string {
  // Small deterministic FNV-1a implementation avoids importing node:crypto,
  // so the read model can also be used by a browser-facing route.
  let hash = 2_166_136_261;
  for (const part of parts.join("\u001f")) {
    hash ^= part.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return `${prefix}-${hash.toString(16).padStart(8, "0")}`;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = text(value)
    ?.toLocaleLowerCase("en-US")
    .replace(/[\s-]+/g, "_") as T | null;
  return candidate && allowed.includes(candidate) ? candidate : fallback;
}

const sourceTypes = [
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
const availabilitySources = [
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
const channelTypes = [
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
const accountPools = [
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
const stationSystems = ["new_api", "sub_to_api", "custom", "unknown"] as const;
const operatorTypes = ["company", "individual", "unknown"] as const;
const commercialRelations = [
  "none",
  "listed",
  "partner",
  "affiliate",
  "sponsored",
  "unknown",
] as const;
const stationStatuses = [
  "active",
  "limited",
  "unavailable",
  "unknown",
] as const;
const billingModes = ["token", "per_request", "fixed"] as const;
const riskLabels = [
  "sample_data",
  "insufficient_samples",
  "mixed_pool",
  "reseller",
  "undisclosed_upstream",
  "third_party_aggregate",
  "pending_feedback",
] as const;
const scopes = ["station", "group", "model", "offer"] as const;
const matchLevels = [
  "exact",
  "group",
  "model",
  "family",
  "station",
  "unknown",
] as const;

function normalizedRate(value: unknown): number | null {
  const parsed = number(value);
  if (parsed === null || parsed < 0) return null;
  // Some SQL views expose percentages (96) while the public contract is 0..1.
  if (Number.isInteger(parsed) && parsed > 1 && parsed <= 100) {
    return parsed / 100;
  }
  return parsed <= 1 ? parsed : null;
}

function normalizeRecentSamples(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((sample) => {
    const row = asRecord(sample);
    if (!row) return [];
    const checkedAt = dateString(pick(row, "checkedAt", "checked_at"));
    const ok = pick(row, "ok", "success") === true;
    const latencyMs = nonNegativeNumber(pick(row, "latencyMs", "latency_ms"));
    return [{ ok, checkedAt, latencyMs }];
  });
}

const EMPTY_AVAILABILITY: TransitAvailability = {
  sevenDayRate: null,
  sevenDaySamples: 0,
  firstCheckedAt: null,
  lastCheckedAt: null,
  latestLatencyMs: null,
  averageLatency7dMs: null,
  note: null,
  sourceType: "unknown",
  sourceLabel: null,
  sourceUrl: null,
  scope: null,
  matchLevel: null,
  monitoringScopeId: null,
  recentSamples: [],
};

export function normalizeTransitAvailability(
  input: unknown,
  fallback: TransitAvailability = EMPTY_AVAILABILITY,
): TransitAvailability {
  const row = asRecord(input);
  if (!row) return structuredClone(fallback);
  const rate =
    normalizedRate(pick(row, "sevenDayRate", "seven_day_rate")) ??
    fallback.sevenDayRate;
  const sampleCount = integer(
    pick(row, "sevenDaySamples", "seven_day_samples", "sampleCount"),
  );
  const firstCheckedAt =
    dateString(pick(row, "firstCheckedAt", "first_checked_at")) ??
    fallback.firstCheckedAt;
  const lastCheckedAt =
    dateString(
      pick(row, "lastCheckedAt", "last_checked_at", "checkedAt", "checked_at"),
    ) ?? fallback.lastCheckedAt;
  const sourceType = enumValue(
    pick(row, "sourceType", "source_type"),
    availabilitySources,
    fallback.sourceType,
  );
  const candidate = {
    sevenDayRate: rate,
    sevenDaySamples: sampleCount ?? fallback.sevenDaySamples,
    firstCheckedAt,
    lastCheckedAt,
    latestLatencyMs:
      nonNegativeNumber(pick(row, "latestLatencyMs", "latest_latency_ms")) ??
      fallback.latestLatencyMs,
    averageLatency7dMs:
      nonNegativeNumber(
        pick(row, "averageLatency7dMs", "avgLatency7dMs", "avg_latency_7d_ms"),
      ) ?? fallback.averageLatency7dMs,
    note: text(pick(row, "note", "publicNote", "public_note")) ?? fallback.note,
    sourceType,
    sourceLabel:
      text(pick(row, "sourceLabel", "source_label")) ?? fallback.sourceLabel,
    sourceUrl:
      urlString(pick(row, "sourceUrl", "source_url")) ?? fallback.sourceUrl,
    scope: enumValue(pick(row, "scope"), scopes, fallback.scope ?? "station"),
    matchLevel: enumValue(
      pick(row, "matchLevel", "match_level"),
      matchLevels,
      fallback.matchLevel ?? "exact",
    ),
    monitoringScopeId:
      text(pick(row, "monitoringScopeId", "monitoring_scope_id")) ??
      fallback.monitoringScopeId,
    recentSamples: normalizeRecentSamples(
      pick(row, "recentSamples", "recent_samples"),
    ).length
      ? normalizeRecentSamples(pick(row, "recentSamples", "recent_samples"))
      : fallback.recentSamples,
  } satisfies TransitAvailability;
  const parsed = transitAvailabilitySchema.safeParse(candidate);
  return parsed.success ? parsed.data : structuredClone(fallback);
}

export function normalizeTransitOffer(
  input: unknown,
  stationId: string,
  fallbackAvailability: TransitAvailability = EMPTY_AVAILABILITY,
  now: Date = new Date(),
): TransitOffer | null {
  const row = asRecord(input);
  if (!row) return null;
  const standardModelId = text(
    pick(
      row,
      "standardModelId",
      "standard_model_id",
      "standardModel",
      "modelSlug",
      "model_slug",
    ),
  );
  if (!standardModelId) return null;
  const standardModelLabel =
    text(
      pick(
        row,
        "standardModelLabel",
        "standard_model_label",
        "modelName",
        "model_name",
      ),
    ) ?? standardModelId;
  const fixedPrice = nonNegativeNumber(pick(row, "fixedPrice", "fixed_price"));
  const rawBillingMode = text(pick(row, "billingMode", "billing_mode"));
  const billingMode = enumValue(
    rawBillingMode ?? (fixedPrice !== null ? "fixed" : "token"),
    billingModes,
    "token",
  );
  const rawRechargeRatio = pick(
    row,
    "rechargeRatioRaw",
    "recharge_ratio",
    "rechargeRatio",
  );
  // The public-data snapshot stores `rechargeRatio` as an already-derived
  // numeric coefficient, while source adapters may retain a textual
  // paid:credited ratio.  Keep both representations losslessly where possible.
  const rechargeRatioRaw =
    typeof rawRechargeRatio === "string"
      ? text(rawRechargeRatio)
      : rawRechargeRatio === null || rawRechargeRatio === undefined
        ? null
        : text(rawRechargeRatio);
  const numericRechargeRatio = nonNegativeNumber(rawRechargeRatio);
  const explicitCoefficient = nonNegativeNumber(
    pick(row, "rechargeCoefficient", "recharge_coefficient"),
  );
  const rechargeCoefficient =
    explicitCoefficient ??
    (typeof rawRechargeRatio === "number"
      ? numericRechargeRatio
      : calculateRechargeCoefficient(rechargeRatioRaw));
  const modelMultiplier = nonNegativeNumber(
    pick(row, "modelMultiplier", "model_multiplier"),
  );
  const stationGroupMultiplier = nonNegativeNumber(
    pick(
      row,
      "stationGroupMultiplier",
      "station_group_multiplier",
      "groupMultiplier",
    ),
  );
  const calculatedCombinedRate = calculateCombinedRate({
    billingMode,
    rechargeCoefficient,
    rechargeRatioRaw,
    modelMultiplier,
    stationGroupMultiplier,
  });
  const combinedRate =
    nonNegativeNumber(
      pick(
        row,
        "combinedRate",
        "combined_rate",
        "combinedMultiplier",
        "combined_multiplier",
      ),
    ) ?? calculatedCombinedRate;
  const id =
    text(pick(row, "id", "offerId", "offer_id")) ??
    stableId(
      [
        stationId,
        standardModelId,
        text(pick(row, "groupName", "group_name")) ?? "default",
        billingMode,
      ],
      "transit-offer",
    );
  const candidate = {
    id,
    stationId,
    family: text(pick(row, "family", "modelFamily", "model_family")) ?? "other",
    standardModelId,
    standardModelLabel,
    standardModel: standardModelLabel,
    groupName: text(pick(row, "groupName", "group_name")) ?? "default",
    billingMode,
    currency: (text(pick(row, "currency")) ?? "CNY").toUpperCase(),
    rechargeRatioRaw,
    rechargeRatio:
      typeof rawRechargeRatio === "number" ? numericRechargeRatio : null,
    rechargeCoefficient,
    modelMultiplier,
    stationGroupMultiplier,
    combinedRate,
    combinedMultiplier: combinedRate,
    inputPrice: nonNegativeNumber(pick(row, "inputPrice", "input_price")),
    outputPrice: nonNegativeNumber(pick(row, "outputPrice", "output_price")),
    cacheReadPrice: nonNegativeNumber(
      pick(row, "cacheReadPrice", "cache_read_price"),
    ),
    cacheWritePrice: nonNegativeNumber(
      pick(row, "cacheWritePrice", "cache_write_price"),
    ),
    imageOutputPrice: nonNegativeNumber(
      pick(row, "imageOutputPrice", "image_output_price"),
    ),
    fixedPrice,
    fixedPriceUnit: text(pick(row, "fixedPriceUnit", "fixed_price_unit")),
    fixedPriceCurrency:
      (
        text(pick(row, "fixedPriceCurrency", "fixed_price_currency")) ??
        (fixedPrice !== null ? (text(pick(row, "currency")) ?? "CNY") : null)
      )?.toUpperCase() ?? null,
    accountPool: enumValue(
      pick(row, "accountPool", "account_pool"),
      accountPools,
      "unknown",
    ),
    channelType: enumValue(
      pick(row, "channelType", "channel_type"),
      channelTypes,
      "unknown",
    ),
    priceSourceUrl: urlString(
      pick(
        row,
        "priceSourceUrl",
        "price_source_url",
        "sourceUrl",
        "source_url",
      ),
    ),
    priceSourceLabel: text(
      pick(
        row,
        "priceSourceLabel",
        "price_source_label",
        "sourceLabel",
        "source_label",
      ),
    ),
    lastVerifiedAt: dateString(
      pick(
        row,
        "lastVerifiedAt",
        "last_verified_at",
        "observedAt",
        "observed_at",
      ),
    ),
    availability: normalizeTransitAvailability(
      pick(row, "availability"),
      fallbackAvailability,
    ),
    status: enumValue(
      pick(row, "status"),
      ["verified", "pending_review", "unavailable", "unknown"] as const,
      "verified",
    ),
  } satisfies TransitOffer;
  if (candidate.status === "verified") {
    const age = candidate.lastVerifiedAt
      ? now.getTime() - Date.parse(candidate.lastVerifiedAt)
      : Infinity;
    if (age > 36 * 60 * 60 * 1000 || age < -5 * 60 * 1000)
      candidate.status = "unknown";
  }
  const parsed = transitOfferSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function normalizeStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => (typeof item === "string" ? [item.trim()] : []))
    .filter(Boolean)
    .slice(0, max);
}

function normalizeUsageAdvice(
  value: unknown,
): "try_small" | "cautious" | "not_recommended" | "pending" {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = text(candidate)?.toLocaleLowerCase("en-US");
  if (normalized === "try_small" || normalized === "try-small") {
    return "try_small";
  }
  if (normalized === "cautious") return "cautious";
  if (normalized === "not_recommended" || normalized === "not-recommended") {
    return "not_recommended";
  }
  return "pending";
}

export function aggregateAvailability(
  samples: readonly UnknownRecord[],
  stationId: string,
  offerId?: string,
  now: Date = new Date(),
): TransitAvailability {
  const matching = samples.filter((sample) => {
    const sampleStation = text(pick(sample, "stationId", "station_id"));
    const sampleOffer = text(pick(sample, "offerId", "offer_id"));
    if (sampleStation !== stationId) return false;
    // An offer view may only consume exact offer samples.  Do not turn a
    // station-wide heartbeat into a claim about a specific model/offer.
    if (offerId && sampleOffer !== offerId) return false;
    if (!offerId && sampleOffer) return false;
    const scope = text(pick(sample, "scope"));
    if (scope && scope !== (offerId ? "offer" : "station")) return false;
    const match = text(pick(sample, "matchLevel", "match_level"));
    if (match && match !== "exact" && !(match === "station" && !offerId))
      return false;
    return true;
  });
  if (!matching.length) return EMPTY_AVAILABILITY;
  const normalized = matching.flatMap((sample) => {
    const checkedAt = dateString(pick(sample, "checkedAt", "checked_at"));
    if (!checkedAt) return [];
    const age = now.getTime() - Date.parse(checkedAt);
    const expiresAt = dateString(pick(sample, "expiresAt", "expires_at"));
    if (
      age < 0 ||
      age >= 7 * 24 * 60 * 60 * 1000 ||
      (expiresAt && Date.parse(expiresAt) <= now.getTime())
    )
      return [];
    const success = pick(sample, "success", "ok");
    if (typeof success !== "boolean") return [];
    return [
      {
        id: text(pick(sample, "id")),
        ok: success,
        count: integer(pick(sample, "sampleCount", "sample_count")) ?? 1,
        summaryRate: normalizedRate(
          pick(sample, "sevenDayRate", "seven_day_rate"),
        ),
        checkedAt,
        latencyMs: nonNegativeNumber(pick(sample, "latencyMs", "latency_ms")),
        sourceType: enumValue(
          pick(sample, "sourceType", "source_type"),
          availabilitySources,
          "unknown",
        ),
        sourceUrl: urlString(pick(sample, "sourceUrl", "source_url")),
        sourceLabel: text(pick(sample, "sourceLabel", "source_label")),
      },
    ];
  });
  if (!normalized.length) return EMPTY_AVAILABILITY;
  normalized.sort((left, right) =>
    left.checkedAt.localeCompare(right.checkedAt),
  );
  const latest = normalized.at(-1)!;
  // A reporting source is one evidence stream; never silently merge another
  // operator's monitor into a claim labelled as this stream.
  const seen = new Set<string>();
  const evidence = normalized.filter((item) => {
    if (
      item.sourceType !== latest.sourceType ||
      item.sourceUrl !== latest.sourceUrl ||
      item.sourceType === "public_model_catalog"
    )
      return false;
    const key = item.id ?? `${item.checkedAt}:${item.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!evidence.length) return EMPTY_AVAILABILITY;
  const newest = evidence.at(-1)!;
  // Rolling summaries overlap. Use only the newest summary, never add their
  // counts or mix them with individual samples from the same window.
  if (newest.summaryRate !== null || newest.count !== 1) {
    return normalizeTransitAvailability({
      sevenDayRate: newest.summaryRate,
      sevenDaySamples: newest.summaryRate === null ? 0 : newest.count,
      lastCheckedAt: newest.checkedAt,
      sourceType: newest.sourceType,
      sourceUrl: newest.sourceUrl,
      sourceLabel: newest.sourceLabel,
      scope: offerId ? "offer" : "station",
      matchLevel: "exact",
      note: "Latest source-reported rolling summary; not independently probed.",
    });
  }
  const raw = evidence.filter(
    (item) => item.summaryRate === null && item.count === 1,
  );
  const latencies = raw
    .map((item) => item.latencyMs)
    .filter((item): item is number => item !== null);
  const rate = raw.filter((item) => item.ok).length / raw.length;
  return normalizeTransitAvailability({
    sevenDayRate: rate,
    sevenDaySamples: raw.length,
    firstCheckedAt: raw[0].checkedAt,
    lastCheckedAt: newest.checkedAt,
    latestLatencyMs: newest.latencyMs,
    averageLatency7dMs: latencies.length
      ? latencies.reduce((sum, item) => sum + item, 0) / latencies.length
      : null,
    sourceType: newest.sourceType,
    sourceUrl: newest.sourceUrl,
    sourceLabel: newest.sourceLabel,
    scope: offerId ? "offer" : "station",
    matchLevel: "exact",
    recentSamples: raw.slice(-100),
  });
}

function unwrapSnapshot(input: unknown): UnknownRecord | unknown[] | null {
  if (Array.isArray(input)) return input;
  const record = asRecord(input);
  if (!record) return null;
  const nested = pick(record, "snapshot", "readModel", "data");
  if (nested && (Array.isArray(nested) || asRecord(nested))) {
    return nested as UnknownRecord | unknown[];
  }
  return record;
}

function statusFromRows(
  stations: TransitStation[],
): TransitReadModel["dataStatus"] {
  if (stations.some((station) => station.dataStatus === "verified")) {
    return "verified";
  }
  if (stations.some((station) => station.dataStatus === "sample"))
    return "sample";
  if (stations.some((station) => station.dataStatus === "pending_review")) {
    return "pending_review";
  }
  return "degraded";
}

/**
 * Convert a loosely typed database snapshot into the public read model.  The
 * function accepts both a future Drizzle adapter's `{stations, offers,
 * availabilitySamples}` object and already-hydrated station rows.  Unknown or
 * private columns are ignored by design.
 */
export function normalizeTransitDatabaseSnapshot(
  input: unknown,
  options: { now?: Date; sourcePolicyVersion?: string } = {},
): TransitReadModel | null {
  const unwrapped = unwrapSnapshot(input);
  if (!unwrapped) return null;
  const root = Array.isArray(unwrapped) ? null : unwrapped;
  const stationRows = Array.isArray(unwrapped)
    ? unwrapped
    : ((pick(
        root!,
        "stations",
        "transitStations",
        "transit_stations",
        "stationRows",
      ) as unknown[] | undefined) ?? []);
  const offerRows = root
    ? ((pick(root, "offers", "transitOffers", "transit_offers", "offerRows") as
        unknown[] | undefined) ?? [])
    : [];
  const sampleRows = root
    ? ((pick(
        root,
        "availabilitySamples",
        "availability_samples",
        "transitAvailabilitySamples",
        "transit_availability_samples",
        "sampleRows",
        "samples",
      ) as unknown[] | undefined) ?? [])
    : [];
  const samplesByScope = new Map<string, UnknownRecord[]>();
  const sampleKey = (stationId: string, offerId?: string | null) =>
    JSON.stringify([stationId, offerId ?? null]);
  for (const item of sampleRows) {
    const row = asRecord(item);
    if (!row) continue;
    const stationId = text(pick(row, "stationId", "station_id"));
    if (!stationId) continue;
    const key = sampleKey(stationId, text(pick(row, "offerId", "offer_id")));
    const bucket = samplesByScope.get(key) ?? [];
    bucket.push(row);
    samplesByScope.set(key, bucket);
  }
  const offersByStation = new Map<string, unknown[]>();
  for (const rawOffer of offerRows) {
    const row = asRecord(rawOffer);
    if (!row) continue;
    const stationId = text(pick(row, "stationId", "station_id"));
    if (!stationId) continue;
    const bucket = offersByStation.get(stationId) ?? [];
    bucket.push(rawOffer);
    offersByStation.set(stationId, bucket);
  }
  const now = options.now ?? new Date();
  const generatedAt =
    dateString(root ? pick(root, "generatedAt", "generated_at") : null) ??
    now.toISOString();
  const stations: TransitStation[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const rawStation of stationRows) {
    const row = asRecord(rawStation);
    if (!row) continue;
    const id = text(pick(row, "id", "stationId", "station_id"));
    const name = text(pick(row, "name", "stationName", "station_name"));
    const stationSlug = name ? explicitOrDerivedSlug(row, name) : null;
    const websiteUrl = urlString(pick(row, "websiteUrl", "website_url", "url"));
    if (!id || !name || !stationSlug || !websiteUrl) continue;
    if (seenIds.has(id) || seenSlugs.has(stationSlug)) continue;
    const stationFallback = aggregateAvailability(
      samplesByScope.get(sampleKey(id)) ?? [],
      id,
      undefined,
      now,
    );
    const rawOffers = [
      ...(Array.isArray(pick(row, "offers", "prices"))
        ? (pick(row, "offers", "prices") as unknown[])
        : []),
      ...(offersByStation.get(id) ?? []),
    ];
    const offers: TransitOffer[] = [];
    const offerIds = new Set<string>();
    for (const rawOffer of rawOffers) {
      const offerRow = asRecord(rawOffer);
      const rawOfferId = offerRow
        ? (text(pick(offerRow, "id", "offerId", "offer_id")) ?? undefined)
        : undefined;
      if (rawOfferId && offerIds.has(rawOfferId)) continue;
      const candidate = normalizeTransitOffer(
        rawOffer,
        id,
        aggregateAvailability(
          rawOfferId
            ? (samplesByScope.get(sampleKey(id, rawOfferId)) ?? [])
            : [],
          id,
          rawOfferId,
          now,
        ),
        now,
      );
      if (!candidate || offerIds.has(candidate.id)) continue;
      offerIds.add(candidate.id);
      offers.push(candidate);
    }
    const explicitAvailability = normalizeTransitAvailability(
      pick(row, "availability"),
      stationFallback,
    );
    const dataStatus = enumValue(
      pick(row, "dataStatus", "data_status", "recordStatus", "record_status"),
      ["sample", "pending_review", "verified", "unpublished"] as const,
      "pending_review",
    );
    const sourceType = enumValue(
      pick(row, "sourceType", "source_type"),
      sourceTypes,
      "unknown",
    ) as TransitSourceType;
    const candidate = {
      id,
      slug: stationSlug,
      name,
      websiteUrl,
      apiBaseUrl: urlString(pick(row, "apiBaseUrl", "api_base_url")),
      monitorUrl: urlString(pick(row, "monitorUrl", "monitor_url")),
      stationSystem: enumValue(
        pick(row, "stationSystem", "station_system"),
        stationSystems,
        "unknown",
      ),
      operatorType: enumValue(
        pick(row, "operatorType", "operator_type"),
        operatorTypes,
        "unknown",
      ),
      status: enumValue(pick(row, "status"), stationStatuses, "unknown"),
      sourceType,
      commercialRelation: enumValue(
        pick(row, "commercialRelation", "commercial_relation"),
        commercialRelations,
        "unknown",
      ),
      summary: text(pick(row, "summary", "description")) ?? "",
      channelTypes: normalizeStringArray(
        pick(row, "channelTypes", "channel_types"),
        30,
      ).map((item) => enumValue(item, channelTypes, "unknown")),
      accountPools: normalizeStringArray(
        pick(row, "accountPools", "account_pools"),
        30,
      ).map((item) => enumValue(item, accountPools, "unknown")),
      paymentMethods: normalizeStringArray(
        pick(row, "paymentMethods", "payment_methods"),
        30,
      ),
      minimumTopUp: text(pick(row, "minimumTopUp", "minimum_top_up")),
      balanceExpiry: text(pick(row, "balanceExpiry", "balance_expiry")),
      riskLabels: normalizeStringArray(
        pick(row, "riskLabels", "risk_labels"),
        30,
      ).flatMap((item) =>
        riskLabels.includes(item as (typeof riskLabels)[number])
          ? [item as (typeof riskLabels)[number]]
          : [],
      ),
      usageAdvice: normalizeUsageAdvice(
        pick(row, "usageAdvice", "usage_advice"),
      ),
      usageAdviceTags: normalizeStringArray(
        pick(row, "usageAdvice", "usage_advice"),
        30,
      ),
      lastUpdatedAt:
        dateString(
          pick(row, "lastUpdatedAt", "last_updated_at"),
          generatedAt,
        ) ?? generatedAt,
      lastCollectedAt: dateString(
        pick(row, "lastCollectedAt", "last_collected_at"),
      ),
      dataStatus,
      availability: explicitAvailability,
      sourceUrl: urlString(pick(row, "sourceUrl", "source_url")),
      sourceLabel: text(pick(row, "sourceLabel", "source_label")),
      offers,
      prices: offers,
      synthetic:
        sourceType === "synthetic_fixture" || pick(row, "synthetic") === true,
    } satisfies TransitStation;
    const parsed = transitStationSchema.safeParse(candidate);
    if (!parsed.success) continue;
    seenIds.add(id);
    seenSlugs.add(stationSlug);
    stations.push(parsed.data);
  }
  if (!stations.length) return null;
  const rootStatus = root
    ? transitDataStatusSchema.safeParse(pick(root, "dataStatus", "data_status"))
    : null;
  const dataStatus =
    (root && pick(root, "dataStatus", "data_status") === "degraded") ||
    Date.parse(generatedAt) - now.getTime() > 5 * 60 * 1000 ||
    now.getTime() - Date.parse(generatedAt) > 36 * 60 * 60 * 1000
      ? "degraded"
      : rootStatus?.success && rootStatus.data !== "unpublished"
        ? rootStatus.data
        : statusFromRows(stations);
  const rootGeneration = root
    ? text(pick(root, "generationId", "generation_id"))
    : null;
  const generationId =
    rootGeneration ??
    stableId(
      stations.map((station) => `${station.id}:${station.lastUpdatedAt}`),
      "transit-generation",
    );
  const candidate = {
    generationId,
    generatedAt,
    sourcePolicyVersion:
      text(
        root
          ? pick(root, "sourcePolicyVersion", "source_policy_version")
          : null,
      ) ??
      options.sourcePolicyVersion ??
      TRANSIT_SOURCE_POLICY_VERSION,
    origin: "database" as const,
    isSynthetic: false,
    degraded: dataStatus === "degraded",
    dataStatus,
    fallbackReason: null,
    warning:
      dataStatus === "degraded"
        ? "The public transit snapshot is stale or degraded; prices may be outdated."
        : undefined,
    stations,
  } satisfies TransitReadModel;
  const parsed = transitReadModelSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Load only the latest published transit generation from the public snapshot
 * database.  Collection never happens in this function; the web process is a
 * bounded read-only consumer and can safely fall back when the tables are not
 * migrated yet.
 */
export async function loadTransitSnapshotFromDatabase(
  database: Database = getPublicDataDatabase(),
): Promise<TransitDatabaseSnapshotInput | null> {
  return database.transaction(
    async (tx) => readTransitSnapshot(tx as unknown as Database),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function readTransitSnapshot(
  database: Database,
): Promise<TransitDatabaseSnapshotInput | null> {
  const [generation] = await database
    .select()
    .from(publicDataGenerations)
    .where(
      and(
        eq(publicDataGenerations.domain, "transit"),
        eq(publicDataGenerations.status, "published"),
      ),
    )
    .orderBy(desc(publicDataGenerations.publishedAt))
    .limit(1);
  if (!generation) return null;
  const [stationRows, offerRows, sampleRows] = await Promise.all([
    database
      .select()
      .from(transitStations)
      .where(eq(transitStations.generationId, generation.id)),
    database
      .select()
      .from(transitOffers)
      .where(eq(transitOffers.generationId, generation.id)),
    database
      .select()
      .from(transitAvailabilitySamples)
      .where(eq(transitAvailabilitySamples.generationId, generation.id)),
  ]);
  return {
    generationId: generation.id,
    generatedAt: generation.generatedAt,
    dataStatus:
      Date.now() - generation.generatedAt.getTime() > 36 * 60 * 60 * 1000
        ? "degraded"
        : "verified",
    stations: stationRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      websiteUrl: row.websiteUrl,
      apiBaseUrl: row.apiBaseUrl,
      status: row.status,
      dataStatus: row.dataStatus,
      stationSystem: row.stationSystem,
      operatorType: row.operatorType,
      commercialRelation: row.commercialRelation,
      summary: row.summary,
      channelTypes: row.channelTypes,
      accountPools: row.accountPools,
      paymentMethods: row.paymentMethods,
      riskLabels: row.riskLabels,
      usageAdvice: row.usageAdvice,
      sourceType: row.sourceType,
      sourceUrl: row.sourceUrl,
      lastUpdatedAt: row.lastUpdatedAt,
      lastCollectedAt: row.lastCollectedAt,
      payload: row.payload,
    })),
    offers: offerRows.map((row) => ({
      id: row.id,
      stationId: row.stationId,
      family: row.family,
      standardModel: row.standardModel,
      groupName: row.groupName,
      billingMode: row.billingMode,
      currency: row.currency,
      rechargeRatio: row.rechargeRatio,
      rechargeCoefficient: row.rechargeCoefficient,
      modelMultiplier: row.modelMultiplier,
      stationGroupMultiplier: row.stationGroupMultiplier,
      combinedMultiplier: row.combinedMultiplier,
      inputPrice: row.inputPrice,
      outputPrice: row.outputPrice,
      cacheReadPrice: row.cacheReadPrice,
      cacheWritePrice: row.cacheWritePrice,
      imageOutputPrice: row.imageOutputPrice,
      fixedPrice: row.fixedPrice,
      fixedPriceCurrency: row.fixedPriceCurrency,
      fixedPriceUnit: row.fixedPriceUnit,
      accountPool: row.accountPool,
      channelType: row.channelType,
      priceSourceUrl: row.priceSourceUrl,
      priceSourceLabel: row.priceSourceLabel,
      lastVerifiedAt: row.lastVerifiedAt,
      availability: row.availability,
      status: row.status,
      payload: row.payload,
    })),
    availabilitySamples: sampleRows.map((row) => ({
      id: row.id,
      stationId: row.stationId,
      offerId: row.offerId,
      scope: row.scope,
      standardModel: row.standardModel,
      groupName: row.groupName,
      sourceType: row.sourceType,
      sourceUrl: row.sourceUrl,
      matchLevel: row.matchLevel,
      success: row.success,
      latencyMs: row.latencyMs,
      sampleCount: row.sampleCount,
      sevenDayRate: row.sevenDayRate,
      checkedAt: row.checkedAt,
      expiresAt: row.expiresAt,
      note: row.note,
    })),
  };
}

function cloneReadModel(model: TransitReadModel): TransitReadModel {
  return structuredClone(model);
}

export function publicStationView(
  station: TransitStation,
  includeUnpublished: boolean,
  offerLimit?: number,
): TransitStation {
  const allOffers = includeUnpublished
    ? station.offers
    : station.offers.filter(isTransitOfferPublic);
  const offers = allOffers.slice(0, offerLimit).map((offer) =>
    offerLimit === undefined
      ? offer
      : {
          ...offer,
          availability: { ...offer.availability, recentSamples: [] },
        },
  );
  return structuredClone({
    ...station,
    availability:
      offerLimit === undefined
        ? station.availability
        : { ...station.availability, recentSamples: [] },
    offers,
    prices: offers,
    offerCount: allOffers.length,
    offersTruncated: offers.length < allOffers.length,
  });
}

function fixtureReadModel(
  fixture: readonly TransitStation[],
  options: {
    now: () => Date;
    sourcePolicyVersion: string;
    degraded: boolean;
    reason: TransitFallbackReason | null;
  },
): TransitReadModel {
  const stations = fixture.map((station) => structuredClone(station));
  const generatedAt = options.now().toISOString();
  const model: TransitReadModel = {
    generationId: "synthetic-transit-fixture-v1",
    generatedAt,
    sourcePolicyVersion: options.sourcePolicyVersion,
    origin: "synthetic_fixture",
    isSynthetic: true,
    degraded: options.degraded,
    dataStatus: options.degraded ? "degraded" : "sample",
    fallbackReason: options.reason,
    stations,
  };
  return transitReadModelSchema.parse(model);
}

function databaseConfigured(): boolean {
  try {
    return isPublicDataDatabaseConfigured();
  } catch {
    return false;
  }
}

function resolveLoader(
  options: TransitRepositoryOptions,
): TransitDatabaseLoader | null {
  if (options.databaseConfigured === false) return null;
  if (options.databaseLoader) return options.databaseLoader;
  if (options.loader) return options.loader;
  if (options.loadFromDatabase) return options.loadFromDatabase;
  if (options.db) return options.db;
  const databaseCandidate = options.database as unknown;
  if (typeof databaseCandidate === "function") {
    return databaseCandidate as TransitDatabaseLoader;
  }
  const databaseObject = databaseCandidate as
    | {
        load?: TransitDatabaseLoader;
        loadTransitSnapshot?: TransitDatabaseLoader;
        select?: unknown;
      }
    | undefined;
  if (databaseObject?.load) return databaseObject.load;
  if (databaseObject?.loadTransitSnapshot)
    return databaseObject.loadTransitSnapshot;
  if (typeof databaseObject?.select === "function") {
    return () => loadTransitSnapshotFromDatabase(options.database as Database);
  }
  if (options.databaseConfigured === true) return null;
  if (databaseConfigured()) {
    return () => loadTransitSnapshotFromDatabase();
  }
  return null;
}

export class TransitRepository {
  private readonly loader: TransitDatabaseLoader | null;
  private readonly fixture: readonly TransitStation[];
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly sourcePolicyVersion: string;
  private readonly allowSyntheticFixture: boolean;
  private readonly explicitlyConfigured: boolean | undefined;
  private readonly hasConfiguredDatabase: boolean;
  private cached: { model: TransitReadModel; cachedAt: number } | null = null;
  private lastGood: TransitReadModel | null = null;

  constructor(options: TransitRepositoryOptions = {}) {
    this.loader = resolveLoader(options);
    this.now = options.now ?? (() => new Date());
    this.cacheTtlMs = Math.max(0, options.cacheTtlMs ?? 30_000);
    this.sourcePolicyVersion =
      options.sourcePolicyVersion ?? TRANSIT_SOURCE_POLICY_VERSION;
    this.explicitlyConfigured = options.databaseConfigured;
    this.hasConfiguredDatabase =
      options.databaseConfigured ??
      (Boolean(options.database) || databaseConfigured());
    this.allowSyntheticFixture =
      options.allowSyntheticFixture ?? process.env.NODE_ENV !== "production";
    const candidateFixture = options.fixture ?? getSyntheticTransitStations();
    const validFixture = candidateFixture.flatMap((station) => {
      const parsed = transitStationSchema.safeParse(station);
      return parsed.success ? [parsed.data] : [];
    });
    this.fixture = validFixture.length
      ? validFixture
      : getSyntheticTransitStations();
  }

  private fallback(reason: TransitFallbackReason): TransitReadModel {
    if (this.lastGood) {
      const degraded = cloneReadModel(this.lastGood);
      degraded.degraded = true;
      degraded.dataStatus = "degraded";
      degraded.fallbackReason = reason;
      return degraded;
    }
    if (!this.allowSyntheticFixture) {
      return {
        generationId: "transit-empty-degraded",
        generatedAt: this.now().toISOString(),
        sourcePolicyVersion: this.sourcePolicyVersion,
        origin: "database",
        isSynthetic: false,
        degraded: true,
        dataStatus: "degraded",
        fallbackReason: reason,
        stations: [],
      };
    }
    return fixtureReadModel(this.fixture, {
      now: this.now,
      sourcePolicyVersion: this.sourcePolicyVersion,
      degraded: reason !== "no_database_loader",
      reason,
    });
  }

  async load(
    options: TransitRepositoryLoadOptions = {},
  ): Promise<TransitReadModel> {
    const nowMs = this.now().getTime();
    if (
      !options.forceRefresh &&
      this.cacheTtlMs > 0 &&
      this.cached &&
      nowMs - this.cached.cachedAt <= this.cacheTtlMs
    ) {
      return cloneReadModel(this.cached.model);
    }
    if (!this.loader) {
      const reason: TransitFallbackReason = this.hasConfiguredDatabase
        ? "database_loader_unconfigured"
        : "no_database_loader";
      const model = this.fallback(reason);
      this.cached = { model, cachedAt: nowMs };
      return cloneReadModel(model);
    }
    try {
      const raw = await this.loader({
        domain: "transit",
        signal: options.signal,
      } satisfies TransitLoadContext);
      const normalized = normalizeTransitDatabaseSnapshot(raw, {
        now: this.now(),
        sourcePolicyVersion: this.sourcePolicyVersion,
      });
      if (!normalized || normalized.stations.length === 0) {
        const model = this.fallback("database_empty");
        this.cached = { model, cachedAt: nowMs };
        return cloneReadModel(model);
      }
      this.lastGood = normalized;
      this.cached = { model: normalized, cachedAt: nowMs };
      return cloneReadModel(normalized);
    } catch {
      const model = this.fallback("database_unavailable");
      this.cached = { model, cachedAt: nowMs };
      return cloneReadModel(model);
    }
  }

  async list(
    input: URLSearchParams | Record<string, unknown> | undefined = undefined,
    options: TransitRepositoryListOptions = {},
  ): Promise<TransitListResult> {
    const query = parseTransitListQuery(input);
    // A caller may force inclusion for an internal review view, but this is
    // never enabled implicitly for public routes.
    if (options.includeUnpublished) query.includeUnpublished = true;
    const model = await this.load(options);
    const filtered = filterTransitStations(model.stations, query, {
      includeSample: model.isSynthetic,
    });
    const visible = filtered.map((station) => {
      const offers = query.includeUnpublished
        ? station.offers
        : station.offers.filter(isTransitOfferPublic);
      return { ...station, offers, prices: offers };
    });
    const visibleById = new Map(
      visible.map((station) => [station.id, station]),
    );
    const structuredFilter = Boolean(
      query.model || query.family || query.channel || query.pool,
    );
    const rankable = structuredFilter
      ? visible.map((station) => {
          const offers = station.offers.filter((offer) =>
            offerMatches(offer, query),
          );
          const latest = offers.reduce(
            (value, offer) =>
              Math.max(value, Date.parse(offer.lastVerifiedAt ?? "") || 0),
            0,
          );
          return {
            ...station,
            offers,
            prices: offers,
            lastUpdatedAt: new Date(latest).toISOString(),
            availability: { ...station.availability, sevenDaySamples: 0 },
          };
        })
      : visible;
    const sorted = sortTransitStations(rankable, query.sort);
    const page = paginateTransitStations(sorted, query);
    const items = page.items.map((rankedStation) => {
      const station = visibleById.get(rankedStation.id)!;
      const q = query.q?.toLocaleLowerCase("en-US");
      const stationMatchesText =
        !q ||
        [station.name, station.slug, station.summary]
          .join(" ")
          .toLocaleLowerCase("en-US")
          .includes(q);
      const preferred = station.offers.filter(
        (offer) =>
          offerMatches(offer, query) &&
          (stationMatchesText ||
            [offer.standardModelId, offer.standardModelLabel, offer.groupName]
              .join(" ")
              .toLocaleLowerCase("en-US")
              .includes(q!)),
      );
      const preferredIds = new Set(preferred.map((offer) => offer.id));
      return publicStationView(
        {
          ...station,
          offers: [
            ...preferred,
            ...station.offers.filter((offer) => !preferredIds.has(offer.id)),
          ],
        },
        query.includeUnpublished,
        TRANSIT_LIST_OFFER_LIMIT,
      );
    });
    return {
      ...page,
      items,
      stations: items,
      generatedAt: model.generatedAt,
      generationId: model.generationId,
      sourcePolicyVersion: model.sourcePolicyVersion,
      origin: model.origin,
      isSynthetic: model.isSynthetic,
      degraded: model.degraded,
      dataStatus: model.dataStatus,
      fallbackReason: model.fallbackReason,
      query,
    };
  }

  async getBySlug(
    slug: string,
    options: TransitRepositoryListOptions = {},
  ): Promise<TransitStation | null> {
    const normalizedSlug = safeSlug(slug);
    if (!normalizedSlug) return null;
    const model = await this.load(options);
    const station = model.stations.find(
      (candidate) =>
        candidate.slug.toLocaleLowerCase("en-US") === normalizedSlug,
    );
    if (!station) return null;
    const includeSample = model.isSynthetic;
    if (
      !isTransitStationPublic(station, {
        includeSample,
        includeUnpublished: options.includeUnpublished,
      })
    ) {
      return null;
    }
    return publicStationView(station, options.includeUnpublished === true);
  }

  async getTransitStations(
    input?: URLSearchParams | Record<string, unknown>,
    options?: TransitRepositoryListOptions,
  ) {
    return this.list(input, options);
  }

  async getSnapshot(options: TransitRepositoryLoadOptions = {}) {
    return this.load(options);
  }

  async getTransitStationBySlug(
    slug: string,
    options?: TransitRepositoryListOptions,
  ) {
    return this.getBySlug(slug, options);
  }

  async listStations(
    input?: URLSearchParams | Record<string, unknown>,
    options?: TransitRepositoryListOptions,
  ) {
    return this.list(input, options);
  }

  async getStationBySlug(slug: string, options?: TransitRepositoryListOptions) {
    return this.getBySlug(slug, options);
  }
}

let defaultRepository: TransitRepository | null = null;

export function createTransitRepository(
  options: TransitRepositoryOptions = {},
): TransitRepository {
  return new TransitRepository(options);
}

export function getDefaultTransitRepository(): TransitRepository {
  return (defaultRepository ??= new TransitRepository());
}

export function resetDefaultTransitRepository(): void {
  defaultRepository = null;
}

export async function loadTransitReadModel(
  options: TransitRepositoryOptions = {},
  loadOptions: TransitRepositoryLoadOptions = {},
): Promise<TransitReadModel> {
  // Supplying options creates an isolated repository, which is useful for a
  // route/test with an injected loader; no options uses the process singleton.
  const repository = Object.keys(options).length
    ? new TransitRepository(options)
    : getDefaultTransitRepository();
  return repository.load(loadOptions);
}

export async function getTransitStations(
  input?: URLSearchParams | Record<string, unknown>,
  options?: TransitRepositoryOptions & TransitRepositoryListOptions,
): Promise<TransitListResult> {
  const { forceRefresh, signal, includeUnpublished, ...repositoryOptions } =
    options ?? {};
  const repository = Object.keys(repositoryOptions).length
    ? new TransitRepository(repositoryOptions)
    : getDefaultTransitRepository();
  return repository.list(input, {
    forceRefresh,
    signal,
    includeUnpublished,
  });
}

export async function getTransitStationBySlug(
  slug: string,
  options?: TransitRepositoryOptions & TransitRepositoryListOptions,
): Promise<TransitStation | null> {
  const { forceRefresh, signal, includeUnpublished, ...repositoryOptions } =
    options ?? {};
  const repository = Object.keys(repositoryOptions).length
    ? new TransitRepository(repositoryOptions)
    : getDefaultTransitRepository();
  return repository.getBySlug(slug, {
    forceRefresh,
    signal,
    includeUnpublished,
  });
}

export const getTransitStation = getTransitStationBySlug;
export const loadTransitRepository = loadTransitReadModel;
export const listTransitStations = getTransitStations;
export const getTransitReadModel = loadTransitReadModel;
export const createRepository = createTransitRepository;
export const loadTransitSnapshot = loadTransitReadModel;

// Keep these aliases available to a future database adapter without requiring
// it to know which helper name the first route used.
export type { TransitDatabaseSnapshotInput, TransitListResult };
export const normalizeTransitSnapshot = normalizeTransitDatabaseSnapshot;
