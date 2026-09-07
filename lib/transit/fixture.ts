import {
  calculateCombinedRate,
  calculateRechargeCoefficient,
} from "@/lib/transit/ranking";
import type {
  TransitAvailability,
  TransitOffer,
  TransitStation,
} from "@/lib/transit/types";
import { transitStationSchema } from "@/lib/transit/types";

/**
 * Deterministic, non-production data used when the transit tables are not
 * available yet.  Every URL intentionally points at example.test and every
 * row is marked `synthetic: true`/`sourceType: synthetic_fixture`; this keeps
 * local development and tests useful without copying a real station catalogue
 * or implying that a real service was verified.
 */

const FIXTURE_UPDATED_AT = "2026-01-15T00:00:00.000Z";

function availability(
  values: Partial<TransitAvailability> = {},
): TransitAvailability {
  return {
    sevenDayRate: null,
    sevenDaySamples: 0,
    firstCheckedAt: null,
    lastCheckedAt: null,
    latestLatencyMs: null,
    averageLatency7dMs: null,
    note: null,
    sourceType: "synthetic_fixture",
    sourceLabel: "Synthetic fixture (not a live check)",
    sourceUrl: "https://example.test/transit/availability",
    scope: "station",
    matchLevel: "exact",
    monitoringScopeId: null,
    recentSamples: [],
    ...values,
  };
}

function offer(
  values: Omit<
    TransitOffer,
    "combinedRate" | "rechargeCoefficient" | "availability"
  > & {
    rechargeCoefficient?: number | null;
    combinedRate?: number | null;
    availability?: Partial<TransitAvailability>;
  },
): TransitOffer {
  const rechargeCoefficient =
    values.rechargeCoefficient ??
    calculateRechargeCoefficient(values.rechargeRatioRaw);
  const combinedRate =
    values.combinedRate ??
    calculateCombinedRate({
      billingMode: values.billingMode,
      rechargeCoefficient,
      rechargeRatioRaw: values.rechargeRatioRaw,
      modelMultiplier: values.modelMultiplier,
      stationGroupMultiplier: values.stationGroupMultiplier,
    });
  return {
    ...values,
    standardModel: values.standardModelLabel,
    rechargeRatio: rechargeCoefficient,
    rechargeCoefficient,
    combinedRate,
    combinedMultiplier: combinedRate,
    availability: availability(values.availability),
  };
}

function station(
  values: Omit<TransitStation, "availability" | "offers" | "prices"> & {
    availability?: Partial<TransitAvailability>;
    offers: TransitOffer[];
  },
): TransitStation {
  const offers = values.offers.map((item) => ({
    ...item,
    stationId: values.id,
  }));
  return transitStationSchema.parse({
    ...values,
    availability: availability(values.availability),
    usageAdviceTags: [values.usageAdvice],
    lastCollectedAt: values.lastUpdatedAt,
    offers,
    prices: offers,
  });
}

const tokenStation = station({
  id: "synthetic-station-token",
  slug: "synthetic-token",
  name: "Synthetic Token Station",
  websiteUrl: "https://token.example.test",
  apiBaseUrl: "https://token.example.test/v1",
  monitorUrl: "https://token.example.test/status",
  stationSystem: "custom",
  operatorType: "unknown",
  status: "active",
  sourceType: "synthetic_fixture",
  commercialRelation: "none",
  summary: "Synthetic token-priced station for local development and tests.",
  channelTypes: ["official_api"],
  accountPools: ["official_api"],
  paymentMethods: ["synthetic"],
  minimumTopUp: "¥1 (fixture)",
  balanceExpiry: "not specified",
  riskLabels: ["sample_data", "insufficient_samples"],
  usageAdvice: "pending",
  lastUpdatedAt: FIXTURE_UPDATED_AT,
  dataStatus: "sample",
  sourceUrl: "https://example.test/transit/token-source",
  sourceLabel: "Synthetic fixture",
  synthetic: true,
  availability: undefined,
  offers: [
    offer({
      id: "synthetic-token-gpt-standard",
      stationId: "synthetic-station-token",
      family: "gpt",
      standardModelId: "gpt-demo",
      standardModelLabel: "Demo GPT",
      groupName: "standard",
      billingMode: "token",
      currency: "CNY",
      rechargeRatioRaw: "1:1.2",
      modelMultiplier: 0.8,
      stationGroupMultiplier: null,
      inputPrice: 1,
      outputPrice: 2,
      cacheReadPrice: 0.5,
      cacheWritePrice: 0.75,
      imageOutputPrice: null,
      fixedPrice: null,
      fixedPriceUnit: null,
      accountPool: "official_api",
      channelType: "official_api",
      priceSourceUrl: "https://example.test/transit/token-source#pricing",
      priceSourceLabel: "Synthetic fixture",
      lastVerifiedAt: FIXTURE_UPDATED_AT,
      availability: {
        sevenDayRate: 0.96,
        sevenDaySamples: 25,
        firstCheckedAt: "2026-01-08T00:00:00.000Z",
        lastCheckedAt: FIXTURE_UPDATED_AT,
        latestLatencyMs: 120,
        averageLatency7dMs: 135,
        scope: "offer",
        matchLevel: "exact",
        recentSamples: [
          { ok: true, checkedAt: FIXTURE_UPDATED_AT, latencyMs: 120 },
        ],
      },
    }),
  ],
});

const fixedStation = station({
  id: "synthetic-station-fixed",
  slug: "synthetic-fixed",
  name: "Synthetic Fixed-Price Station",
  websiteUrl: "https://fixed.example.test",
  apiBaseUrl: "https://fixed.example.test/api",
  monitorUrl: null,
  stationSystem: "new_api",
  operatorType: "company",
  status: "limited",
  sourceType: "synthetic_fixture",
  commercialRelation: "listed",
  summary: "Synthetic fixed-unit offer; it must not be ranked as token cost.",
  channelTypes: ["cloud"],
  accountPools: ["enterprise"],
  paymentMethods: ["synthetic"],
  minimumTopUp: null,
  balanceExpiry: null,
  riskLabels: ["sample_data"],
  usageAdvice: "cautious",
  lastUpdatedAt: FIXTURE_UPDATED_AT,
  dataStatus: "sample",
  sourceUrl: "https://example.test/transit/fixed-source",
  sourceLabel: "Synthetic fixture",
  synthetic: true,
  availability: undefined,
  offers: [
    offer({
      id: "synthetic-fixed-image",
      stationId: "synthetic-station-fixed",
      family: "image",
      standardModelId: "image-demo",
      standardModelLabel: "Demo Image",
      groupName: "image",
      billingMode: "fixed",
      currency: "CNY",
      rechargeRatioRaw: null,
      modelMultiplier: null,
      stationGroupMultiplier: null,
      inputPrice: null,
      outputPrice: null,
      cacheReadPrice: null,
      cacheWritePrice: null,
      imageOutputPrice: null,
      fixedPrice: 2.5,
      fixedPriceUnit: "image",
      accountPool: "enterprise",
      channelType: "cloud",
      priceSourceUrl: "https://example.test/transit/fixed-source#pricing",
      priceSourceLabel: "Synthetic fixture",
      lastVerifiedAt: FIXTURE_UPDATED_AT,
      availability: {
        sevenDayRate: 0.8,
        sevenDaySamples: 5,
        firstCheckedAt: "2026-01-12T00:00:00.000Z",
        lastCheckedAt: FIXTURE_UPDATED_AT,
        latestLatencyMs: 800,
        averageLatency7dMs: 820,
        scope: "offer",
        matchLevel: "exact",
      },
    }),
  ],
});

const pendingStation = station({
  id: "synthetic-station-pending",
  slug: "synthetic-pending",
  name: "Synthetic Pending Station",
  websiteUrl: "https://pending.example.test",
  apiBaseUrl: null,
  monitorUrl: null,
  stationSystem: "unknown",
  operatorType: "unknown",
  status: "active",
  sourceType: "synthetic_fixture",
  commercialRelation: "unknown",
  summary: "Synthetic pending-review row; hidden from the public default list.",
  channelTypes: [],
  accountPools: [],
  paymentMethods: [],
  minimumTopUp: null,
  balanceExpiry: null,
  riskLabels: ["sample_data", "pending_feedback"],
  usageAdvice: "pending",
  lastUpdatedAt: FIXTURE_UPDATED_AT,
  dataStatus: "pending_review",
  sourceUrl: "https://example.test/transit/pending-source",
  sourceLabel: "Synthetic fixture",
  synthetic: true,
  availability: undefined,
  offers: [],
});

export const SYNTHETIC_TRANSIT_STATIONS: readonly TransitStation[] = [
  tokenStation,
  fixedStation,
  pendingStation,
];

export const transitFixture = SYNTHETIC_TRANSIT_STATIONS;
export const syntheticTransitFixture = SYNTHETIC_TRANSIT_STATIONS;

/** Return a fresh copy so callers cannot mutate the module-level fixture. */
export function getSyntheticTransitStations(): TransitStation[] {
  return SYNTHETIC_TRANSIT_STATIONS.map((item) => structuredClone(item));
}

/** Backwards-friendly alias for repository integrations. */
export const getSyntheticTransitFixture = getSyntheticTransitStations;
