import {
  isTransitStationPublic,
  transitListQuerySchema,
  type TransitAvailability,
  type TransitBillingMode,
  type TransitListQuery,
  type TransitOffer,
  type TransitSortKey,
  type TransitStation,
} from "@/lib/transit/types";
import { z } from "zod";

/**
 * A ratio is written as `paid:credited` by the source.  The coefficient used
 * by this project is deliberately named/documented as *paid CNY per one quota
 * CNY*, so `1:1.2` becomes `1 / 1.2`.  Keeping the raw ratio and derived number
 * together avoids the reciprocal ambiguity found in a number of upstream
 * catalogues.
 */
export type ParsedRechargeRatio = {
  paid: number;
  credited: number;
};

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function parseRechargeRatio(
  raw: string | null | undefined,
): ParsedRechargeRatio | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replaceAll("：", ":").replace(/\s+/g, "");
  const match = normalized.match(
    /^([0-9]+(?:\.[0-9]+)?):([0-9]+(?:\.[0-9]+)?)$/,
  );
  if (!match) return null;
  const paid = Number(match[1]);
  const credited = Number(match[2]);
  if (!finitePositive(paid) || !finitePositive(credited)) return null;
  return { paid, credited };
}

export function calculateRechargeCoefficient(
  raw: string | null | undefined,
): number | null {
  const ratio = parseRechargeRatio(raw);
  if (!ratio) return null;
  const coefficient = ratio.paid / ratio.credited;
  return Number.isFinite(coefficient) && coefficient >= 0 ? coefficient : null;
}

export type CombinedRateInput = {
  billingMode: TransitBillingMode | null | undefined;
  rechargeCoefficient?: number | null;
  rechargeRatioRaw?: string | null;
  modelMultiplier?: number | null;
  stationGroupMultiplier?: number | null;
};

/**
 * Compute the comparable token rate on the server/read-model side.
 * Fixed and per-request offers intentionally return null because they do not
 * share a token benchmark.  A station/group multiplier takes precedence over
 * a model multiplier when both are present.
 */
export function calculateCombinedRate(input: CombinedRateInput): number | null {
  if (input.billingMode !== "token") return null;
  const coefficient =
    input.rechargeCoefficient ??
    calculateRechargeCoefficient(input.rechargeRatioRaw ?? null);
  const multiplier =
    input.stationGroupMultiplier ?? input.modelMultiplier ?? null;
  if (!finitePositive(coefficient) || !Number.isFinite(multiplier ?? NaN)) {
    return null;
  }
  if ((multiplier ?? 0) < 0) return null;
  const result = coefficient * (multiplier as number);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

/** Alias that reads naturally in route/adapter code. */
export const computeCombinedRate = calculateCombinedRate;
export const calculateTransitCombinedRate = calculateCombinedRate;
export const calculateTransitRechargeCoefficient = calculateRechargeCoefficient;

function comparableRate(station: TransitStation): number | null {
  const rates = station.offers
    .filter(
      (offer) =>
        (offer.status === undefined || offer.status === "verified") &&
        offer.billingMode === "token",
    )
    .map((offer) => offer.combinedRate)
    .filter((value): value is number => Number.isFinite(value));
  return rates.length ? Math.min(...rates) : null;
}

export function isTransitOfferPublic(offer: TransitOffer): boolean {
  return offer.status === undefined || offer.status === "verified";
}

export function getTransitComparableRate(
  station: TransitStation,
): number | null {
  return comparableRate(station);
}

function freshestTimestamp(station: TransitStation): number {
  const values = [
    Date.parse(station.lastUpdatedAt),
    ...station.offers.map((offer) =>
      offer.lastVerifiedAt ? Date.parse(offer.lastVerifiedAt) : Number.NaN,
    ),
  ].filter((value) => Number.isFinite(value));
  return values.length ? Math.max(...values) : 0;
}

function stabilityScore(station: TransitStation): number | null {
  const values = station.offers
    .map((offer) => offer.availability)
    .filter((availability) => availability.sevenDayRate !== null);
  if (!values.length) return null;
  // Use the strongest available exact sample, while leaving sample count as a
  // tie-breaker.  This is intentionally not a hidden weighted recommendation.
  return Math.max(...values.map((item) => item.sevenDayRate as number));
}

function sampleCount(station: TransitStation): number {
  return Math.max(
    station.availability.sevenDaySamples,
    ...station.offers.map((offer) => offer.availability.sevenDaySamples),
  );
}

function compareNullableAscending(
  left: number | null,
  right: number | null,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareNullableDescending(
  left: number | null,
  right: number | null,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareNames(left: TransitStation, right: TransitStation): number {
  const byName = left.name.localeCompare(right.name, "zh-Hans", {
    sensitivity: "base",
  });
  return byName || left.slug.localeCompare(right.slug, "en");
}

/**
 * Stable, explainable ordering.  Commercial relation is deliberately absent;
 * sponsorship/AFF must never change natural ordering.
 */
export function sortTransitStations(
  stations: readonly TransitStation[],
  sort: TransitSortKey = "overall",
): TransitStation[] {
  return [...stations].sort((left, right) => {
    const publication = (station: TransitStation) =>
      station.dataStatus === "verified" || station.dataStatus === "sample"
        ? 0
        : station.dataStatus === "pending_review"
          ? 1
          : 2;
    const visibility = (station: TransitStation) =>
      station.status === "active" ? 0 : station.status === "limited" ? 1 : 2;
    let result = publication(left) - publication(right);
    if (result === 0 && sort !== "name") {
      result = visibility(left) - visibility(right);
    }

    if (result === 0) {
      switch (sort) {
        case "rate":
          result = compareNullableAscending(
            comparableRate(left),
            comparableRate(right),
          );
          break;
        case "stability":
          result = compareNullableDescending(
            stabilityScore(left),
            stabilityScore(right),
          );
          if (result === 0) result = sampleCount(right) - sampleCount(left);
          break;
        case "updated":
          result = freshestTimestamp(right) - freshestTimestamp(left);
          break;
        case "name":
          result = compareNames(left, right);
          break;
        case "overall":
        default:
          // Comparable rates first; then availability and freshness.  Each
          // component is visible in the read model and can be explained.
          result = compareNullableAscending(
            comparableRate(left),
            comparableRate(right),
          );
          if (result === 0) {
            result = compareNullableDescending(
              stabilityScore(left),
              stabilityScore(right),
            );
          }
          if (result === 0)
            result = freshestTimestamp(right) - freshestTimestamp(left);
          break;
      }
    }
    return result || compareNames(left, right);
  });
}

/** Alias used by callers that call the ordering operation "rank". */
export const rankTransitStations = sortTransitStations;
export const sortStations = sortTransitStations;
export const filterStations = filterTransitStations;

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

export function offerMatches(
  offer: TransitOffer,
  query: TransitListQuery,
): boolean {
  if (query.family && normalized(offer.family) !== normalized(query.family)) {
    return false;
  }
  if (
    query.model &&
    normalized(offer.standardModelId) !== normalized(query.model) &&
    normalized(offer.standardModelLabel) !== normalized(query.model)
  ) {
    return false;
  }
  if (query.channel && offer.channelType !== query.channel) return false;
  if (query.pool && offer.accountPool !== query.pool) return false;
  return true;
}

export function transitStationMatchesQuery(
  station: TransitStation,
  query: Partial<TransitListQuery> = {},
  options: { includeSample?: boolean } = {},
): boolean {
  const includeUnpublished = query.includeUnpublished === true;
  if (
    !isTransitStationPublic(station, {
      includeSample: options.includeSample ?? true,
      includeUnpublished,
    })
  ) {
    return false;
  }
  if (query.risk && !station.riskLabels.some((label) => label === query.risk)) {
    return false;
  }
  const text = normalized(query.q);
  if (text) {
    const haystack = [
      station.name,
      station.slug,
      station.summary,
      ...station.offers
        .filter((offer) => includeUnpublished || isTransitOfferPublic(offer))
        .flatMap((offer) => [
          offer.standardModelId,
          offer.standardModelLabel,
          offer.groupName,
        ]),
    ]
      .join(" ")
      .toLocaleLowerCase("en-US");
    if (!haystack.includes(text)) return false;
  }
  if (query.family || query.model || query.channel || query.pool) {
    if (
      !station.offers.some(
        (offer) =>
          isTransitOfferPublic(offer) &&
          offerMatches(offer, query as TransitListQuery),
      )
    ) {
      return false;
    }
  }
  return true;
}

export function filterTransitStations(
  stations: readonly TransitStation[],
  query: Partial<TransitListQuery> = {},
  options: { includeSample?: boolean } = {},
): TransitStation[] {
  return stations.filter((station) =>
    transitStationMatchesQuery(station, query, options),
  );
}

/** Parse query input without allowing silently ignored/ambiguous parameters. */
export function safeParseTransitListQuery(
  input: URLSearchParams | Record<string, unknown> | undefined,
) {
  const record: Record<string, unknown> = {};
  if (input instanceof URLSearchParams) {
    input.forEach((value, key) => {
      // A repeated parameter is ambiguous for a scalar filter; reject it via
      // the schema rather than silently choosing one value.
      if (key in record) record[key] = [record[key], value];
      else record[key] = value;
    });
  } else if (input) {
    Object.assign(record, input);
  }
  return transitListQuerySchema.safeParse(record);
}

export class TransitQueryError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[] = [],
  ) {
    super(message);
    this.name = "TransitQueryError";
  }
}

export function parseTransitListQuery(
  input: URLSearchParams | Record<string, unknown> | undefined,
): TransitListQuery {
  const result = safeParseTransitListQuery(input);
  if (!result.success) {
    throw new TransitQueryError("Invalid transit query", result.error.issues);
  }
  return result.data;
}

export function encodeTransitCursor(offset: number): string {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError(
      "Transit cursor offset must be a non-negative integer",
    );
  }
  return `o${offset.toString(36)}`;
}

export function decodeTransitCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  if (!/^o[0-9a-z]+$/i.test(cursor)) {
    throw new TransitQueryError("Invalid transit cursor");
  }
  const offset = Number.parseInt(cursor.slice(1), 36);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new TransitQueryError("Invalid transit cursor");
  }
  return offset;
}

export type TransitPagination = {
  items: TransitStation[];
  total: number;
  nextCursor: string | null;
};

export function paginateTransitStations(
  stations: readonly TransitStation[],
  query: Pick<TransitListQuery, "limit" | "cursor">,
): TransitPagination {
  const offset = decodeTransitCursor(query.cursor);
  const limit = Math.min(Math.max(query.limit, 1), 50);
  const items = stations.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    total: stations.length,
    nextCursor:
      nextOffset < stations.length ? encodeTransitCursor(nextOffset) : null,
  };
}

/** Read-only helper for tests and adapters that need an explicit availability. */
export function availabilityRate(
  availability: Pick<TransitAvailability, "sevenDayRate" | "sevenDaySamples">,
): number | null {
  if (availability.sevenDayRate === null || availability.sevenDaySamples <= 0) {
    return null;
  }
  return availability.sevenDayRate;
}
