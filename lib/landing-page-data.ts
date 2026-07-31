import type { LandingPageDefinition } from "@/lib/landing-pages";
import { displayableOffers } from "@/lib/pricing/format";
import {
  PRICING_PAGE_CACHE_TAG,
  PRICING_PAGE_REVALIDATE_SECONDS,
} from "@/lib/pricing/page-cache";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import type {
  ApiPriceType,
  BillingPeriod,
  PriceMode,
  PriceOffer,
  ProviderCatalogItem,
} from "@/lib/pricing/types";
import { unstable_cache } from "next/cache";

export type LandingFreshness = "fresh" | "delayed" | "stale" | "unknown";

export type LandingCatalogSnapshot = Record<PriceMode, ProviderCatalogItem[]>;

export type ComparablePriceGroup = {
  key: string;
  kind: "subscription" | "api";
  providerId: string;
  providerName: string;
  label: string;
  billingPeriod?: BillingPeriod;
  modelSlug?: string;
  priceType?: ApiPriceType;
  priceTier?: string;
  unit?: string;
  offers: PriceOffer[];
  regionCount: number;
  minimum?: PriceOffer;
  maximum?: PriceOffer;
  spreadCny?: number;
  spreadPercent?: number;
};

export type LandingApiModel = {
  providerId: string;
  providerLabel: string;
  providerColor: string;
  name: string;
  slug: string;
  order: number;
  offers: PriceOffer[];
};

export type LandingTokenHighlight = {
  priceType: "cached_input" | "input" | "output";
  modelName: string;
  offer: PriceOffer;
};

export type LandingPageQuality = {
  indexable: boolean;
  reason:
    | "indexable"
    | "no_checked_data"
    | "insufficient_global_regions"
    | "no_domestic_offer"
    | "no_stable_api_model"
    | "expired";
  freshness: LandingFreshness;
  lastCheckedAt?: string;
  priceModifiedAt?: string;
  pageModifiedAt: string;
};

export type LandingPageSummary = {
  offerCount: number;
  regionCount: number;
  modelCount: number;
  subscriptionGroups: ComparablePriceGroup[];
  apiGroups: ComparablePriceGroup[];
  tokenHighlights: LandingTokenHighlight[];
};

export type LandingPageData = {
  page: LandingPageDefinition;
  globalProviders: ProviderCatalogItem[];
  subscriptionProviders: ProviderCatalogItem[];
  apiProviders: ProviderCatalogItem[];
  quality: LandingPageQuality;
  summary: LandingPageSummary;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SEVEN_DAYS_MS = 7 * DAY_MS;
const TOKEN_UNIT = "/百万 tokens";

function latestIso(values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function earliestIso(values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0);
}

function maxIso(...values: Array<string | undefined>): string | undefined {
  return latestIso(values);
}

function normalizedUnit(unit?: string): string | undefined {
  return unit?.replace(/\s+/g, " ").trim();
}

function eligibleOffer(offer: PriceOffer): boolean {
  return (
    offer.amountMinor !== null &&
    offer.currency !== null &&
    offer.status !== "pending" &&
    offer.status !== "unpublished"
  );
}

function comparableCny(offer: PriceOffer): number | undefined {
  return offer.convertedCny !== undefined && Number.isFinite(offer.convertedCny)
    ? offer.convertedCny
    : undefined;
}

function compareGroupOffers(
  offers: PriceOffer[],
): Pick<
  ComparablePriceGroup,
  "minimum" | "maximum" | "spreadCny" | "spreadPercent"
> {
  const comparable = offers
    .filter((offer) => comparableCny(offer) !== undefined)
    .sort(
      (a, b) =>
        (comparableCny(a) ?? Number.POSITIVE_INFINITY) -
        (comparableCny(b) ?? Number.POSITIVE_INFINITY),
    );
  const minimum = comparable.at(0);
  const maximum = comparable.at(-1);
  const minimumCny = minimum ? comparableCny(minimum) : undefined;
  const maximumCny = maximum ? comparableCny(maximum) : undefined;
  if (minimumCny === undefined || maximumCny === undefined || minimumCny <= 0) {
    return { minimum, maximum };
  }
  const spreadCny = Number((maximumCny - minimumCny).toFixed(6));
  return {
    minimum,
    maximum,
    spreadCny,
    spreadPercent: (spreadCny / minimumCny) * 100,
  };
}

function subscriptionGroups(
  providers: ProviderCatalogItem[],
  page: LandingPageDefinition,
): ComparablePriceGroup[] {
  const groups = new Map<
    string,
    {
      provider: ProviderCatalogItem;
      offers: PriceOffer[];
    }
  >();
  for (const provider of providers) {
    if (!provider.sourceUrl) continue;
    for (const offer of offersForLandingPage(page, provider)) {
      if (!eligibleOffer(offer)) continue;
      const key = [
        provider.id,
        offer.planId,
        offer.billingPeriod,
        normalizedUnit(offer.unit) ?? "",
        provider.sourceType,
      ].join("|");
      const current = groups.get(key);
      if (current) current.offers.push(offer);
      else groups.set(key, { provider, offers: [offer] });
    }
  }

  return [...groups.entries()]
    .map(([key, { provider, offers }]) => {
      const first = offers[0]!;
      return {
        key,
        kind: "subscription" as const,
        providerId: provider.id,
        providerName: provider.name,
        label: first.planName,
        billingPeriod: first.billingPeriod,
        unit: normalizedUnit(first.unit),
        offers,
        regionCount: new Set(
          offers
            .map((offer) => offer.regionCode)
            .filter((value): value is string => Boolean(value)),
        ).size,
        ...compareGroupOffers(offers),
      };
    })
    .sort(
      (a, b) =>
        a.providerName.localeCompare(b.providerName, "zh-CN") ||
        a.label.localeCompare(b.label, "zh-CN"),
    );
}

function apiGroups(providers: ProviderCatalogItem[]): ComparablePriceGroup[] {
  const groups = new Map<
    string,
    {
      provider: ProviderCatalogItem;
      offers: PriceOffer[];
    }
  >();
  for (const provider of providers) {
    if (!provider.sourceUrl) continue;
    for (const offer of displayableOffers(provider.offers)) {
      if (!eligibleOffer(offer) || !offer.modelSlug) continue;
      const unit = normalizedUnit(offer.unit);
      if (!unit) continue;
      const key = [
        provider.id,
        offer.modelSlug,
        offer.priceType ?? "other",
        offer.priceTier ?? "",
        unit,
      ].join("|");
      const current = groups.get(key);
      if (current) current.offers.push(offer);
      else groups.set(key, { provider, offers: [offer] });
    }
  }

  return [...groups.entries()]
    .map(([key, { provider, offers }]) => {
      const first = offers[0]!;
      return {
        key,
        kind: "api" as const,
        providerId: provider.id,
        providerName: provider.name,
        label: first.modelName ?? first.planName,
        modelSlug: first.modelSlug,
        priceType: first.priceType ?? "other",
        priceTier: first.priceTier,
        unit: normalizedUnit(first.unit),
        offers,
        regionCount: 0,
      };
    })
    .sort(
      (a, b) =>
        a.providerName.localeCompare(b.providerName, "zh-CN") ||
        a.label.localeCompare(b.label, "zh-CN") ||
        (a.priceType ?? "").localeCompare(b.priceType ?? ""),
    );
}

function tokenHighlightsFor(
  groups: ComparablePriceGroup[],
): LandingTokenHighlight[] {
  const priceTypes = ["cached_input", "input", "output"] as const;
  return priceTypes.flatMap((priceType) => {
    const candidates = groups
      .filter(
        (group) => group.unit === TOKEN_UNIT && group.priceType === priceType,
      )
      .flatMap((group) =>
        group.offers.map((offer) => ({
          modelName: group.label,
          offer,
        })),
      )
      .filter(({ offer }) => eligibleOffer(offer))
      .sort(
        (a, b) =>
          (a.offer.amountMinor ?? Number.POSITIVE_INFINITY) -
          (b.offer.amountMinor ?? Number.POSITIVE_INFINITY),
      );
    const first = candidates[0];
    return first ? [{ priceType, ...first }] : [];
  });
}

function freshnessFor(
  lastCheckedAt: string | undefined,
  now: Date,
): LandingFreshness {
  if (!lastCheckedAt) return "unknown";
  const age = now.getTime() - new Date(lastCheckedAt).getTime();
  if (!Number.isFinite(age)) return "unknown";
  if (age <= 8 * HOUR_MS) return "fresh";
  if (age <= DAY_MS) return "delayed";
  return "stale";
}

function checkedWithinIndexWindow(
  checkedAt: string | undefined,
  now: Date,
): boolean {
  if (!checkedAt) return false;
  const checkedTime = new Date(checkedAt).getTime();
  return (
    Number.isFinite(checkedTime) && now.getTime() - checkedTime <= SEVEN_DAYS_MS
  );
}

function providerWithCurrentOffers(
  provider: ProviderCatalogItem,
  now: Date,
): ProviderCatalogItem | undefined {
  const offers = provider.offers.filter((offer) =>
    checkedWithinIndexWindow(
      offer.lastCheckedAt ?? provider.lastCheckedAt,
      now,
    ),
  );
  if (offers.length === 0) return undefined;
  return {
    ...provider,
    offers,
    lastCheckedAt: earliestIso(
      offers.map((offer) => offer.lastCheckedAt ?? provider.lastCheckedAt),
    ),
  };
}

function pageQuality(
  page: LandingPageDefinition,
  providers: ProviderCatalogItem[],
  sourceProviders: ProviderCatalogItem[],
  summary: LandingPageSummary,
  now: Date,
): LandingPageQuality {
  const lastCheckedAt = earliestIso(
    providers.map((provider) => provider.lastCheckedAt),
  );
  const priceModifiedAt = latestIso(
    providers.flatMap((provider) =>
      offersForLandingPage(page, provider).map((offer) => offer.observedAt),
    ),
  );
  const pageModifiedAt =
    maxIso(priceModifiedAt, page.contentUpdatedAt) ?? page.contentUpdatedAt;
  const freshness = freshnessFor(lastCheckedAt, now);
  if (!lastCheckedAt) {
    const sourceLastCheckedAt = latestIso(
      sourceProviders.map((provider) => provider.lastCheckedAt),
    );
    const sourceAge = sourceLastCheckedAt
      ? now.getTime() - new Date(sourceLastCheckedAt).getTime()
      : Number.NaN;
    return {
      indexable: false,
      reason:
        Number.isFinite(sourceAge) && sourceAge > SEVEN_DAYS_MS
          ? "expired"
          : "no_checked_data",
      freshness:
        Number.isFinite(sourceAge) && sourceAge > DAY_MS ? "stale" : freshness,
      lastCheckedAt: sourceLastCheckedAt,
      priceModifiedAt,
      pageModifiedAt,
    };
  }

  if (page.type === "global") {
    const indexable = summary.subscriptionGroups.some(
      (group) => group.regionCount >= 3,
    );
    return {
      indexable,
      reason: indexable ? "indexable" : "insufficient_global_regions",
      freshness,
      lastCheckedAt,
      priceModifiedAt,
      pageModifiedAt,
    };
  }

  const subscriptionIndexable = summary.subscriptionGroups.length > 0;
  const apiIndexable = summary.apiGroups.length > 0;
  const hasSubscription = Boolean(
    page.providerIds["china-subscription"]?.length,
  );
  const reason =
    subscriptionIndexable || apiIndexable
      ? "indexable"
      : hasSubscription
        ? "no_domestic_offer"
        : "no_stable_api_model";
  return {
    indexable: subscriptionIndexable || apiIndexable,
    reason,
    freshness,
    lastCheckedAt,
    priceModifiedAt,
    pageModifiedAt,
  };
}

function selectProviders(
  page: LandingPageDefinition,
  mode: PriceMode,
  snapshot: LandingCatalogSnapshot,
): ProviderCatalogItem[] {
  const ids = new Set(page.providerIds[mode] ?? []);
  return snapshot[mode].filter((provider) => ids.has(provider.id));
}

export function buildLandingPageData(
  page: LandingPageDefinition,
  snapshot: LandingCatalogSnapshot,
  now = new Date(),
): LandingPageData {
  const globalProviders = selectProviders(page, "global", snapshot);
  const rawSubscriptionProviders = selectProviders(
    page,
    "china-subscription",
    snapshot,
  );
  const rawApiProviders = selectProviders(page, "api", snapshot);
  const sourceProviders = [
    ...globalProviders,
    ...rawSubscriptionProviders,
    ...rawApiProviders,
  ];
  const currentProviders = sourceProviders.flatMap((provider) => {
    const current = providerWithCurrentOffers(provider, now);
    return current ? [current] : [];
  });
  const currentProvidersById = new Map(
    currentProviders.map((provider) => [provider.id, provider]),
  );
  const currentGlobalProviders = globalProviders.flatMap((provider) => {
    const current = currentProvidersById.get(provider.id);
    return current ? [current] : [];
  });
  const subscriptionProviders = rawSubscriptionProviders.flatMap((provider) => {
    const current = currentProvidersById.get(provider.id);
    return current ? [current] : [];
  });
  const apiProviders = rawApiProviders.flatMap((provider) => {
    const current = currentProvidersById.get(provider.id);
    return current ? [current] : [];
  });
  const groupedSubscriptions = subscriptionGroups(
    [...currentGlobalProviders, ...subscriptionProviders],
    page,
  );
  const groupedApi = apiGroups(apiProviders);
  const stableModels = apiModelsForLandingPage(apiProviders);
  const visibleOffers = currentProviders.flatMap((provider) =>
    offersForLandingPage(page, provider),
  );
  const summary: LandingPageSummary = {
    offerCount: visibleOffers.filter(eligibleOffer).length,
    regionCount: new Set(
      visibleOffers
        .map((offer) => offer.regionCode)
        .filter((value): value is string => Boolean(value)),
    ).size,
    modelCount: stableModels.length,
    subscriptionGroups: groupedSubscriptions,
    apiGroups: groupedApi,
    tokenHighlights: tokenHighlightsFor(groupedApi),
  };

  return {
    page,
    globalProviders: currentGlobalProviders,
    subscriptionProviders,
    apiProviders,
    summary,
    quality: pageQuality(page, currentProviders, sourceProviders, summary, now),
  };
}

export const loadCachedLandingCatalogSnapshot = unstable_cache(
  async (): Promise<LandingCatalogSnapshot> => {
    const strict = process.env.NODE_ENV === "production";
    const [global, chinaSubscription, api] = await Promise.all([
      loadProviderCatalog("global", undefined, {
        fallbackOnError: !strict,
      }),
      loadProviderCatalog("china-subscription", undefined, {
        fallbackOnError: !strict,
      }),
      loadProviderCatalog("api", undefined, {
        fallbackOnError: !strict,
      }),
    ]);
    return {
      global,
      "china-subscription": chinaSubscription,
      api,
    };
  },
  ["seo-landing-catalog-v2"],
  {
    revalidate: PRICING_PAGE_REVALIDATE_SECONDS,
    tags: [PRICING_PAGE_CACHE_TAG],
  },
);

export async function loadLandingPageData(
  page: LandingPageDefinition,
): Promise<LandingPageData> {
  return buildLandingPageData(page, await loadCachedLandingCatalogSnapshot());
}

export function offersForLandingPage(
  page: LandingPageDefinition,
  provider: ProviderCatalogItem,
): PriceOffer[] {
  const offers = displayableOffers(provider.offers);
  if (!page.planIds?.length) return offers;
  const allowed = new Set(page.planIds);
  return offers.filter((offer) => allowed.has(offer.planId));
}

function modelNameForOffer(offer: PriceOffer): string {
  return (
    offer.modelName ??
    offer.planName.split(/\s*·\s*/)[0]?.trim() ??
    offer.planName
  );
}

export function apiModelsForLandingPage(
  providers: ProviderCatalogItem[],
): LandingApiModel[] {
  const models = new Map<string, LandingApiModel>();
  for (const provider of providers) {
    for (const offer of displayableOffers(provider.offers)) {
      if (
        !offer.modelSlug ||
        offer.status === "pending" ||
        offer.status === "unpublished"
      ) {
        continue;
      }
      const name = modelNameForOffer(offer);
      const key = `${provider.id}:${offer.modelSlug}`;
      const current = models.get(key);
      if (current) {
        current.offers.push(offer);
        current.order = Math.min(
          current.order,
          offer.modelOrder ?? Number.MAX_SAFE_INTEGER,
        );
        continue;
      }
      models.set(key, {
        providerId: provider.id,
        providerLabel: provider.label,
        providerColor: provider.color,
        name,
        slug: offer.modelSlug,
        order: offer.modelOrder ?? Number.MAX_SAFE_INTEGER,
        offers: [offer],
      });
    }
  }

  return [...models.values()]
    .map((model) => ({
      ...model,
      offers: [...model.offers].sort(
        (a, b) =>
          (a.tierOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.tierOrder ?? Number.MAX_SAFE_INTEGER) ||
          (a.priceType ?? "").localeCompare(b.priceType ?? "") ||
          a.planName.localeCompare(b.planName, "zh-CN"),
      ),
    }))
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.providerLabel.localeCompare(b.providerLabel, "zh-CN") ||
        a.name.localeCompare(b.name, "zh-CN"),
    );
}

export function apiOffersForLandingPage(
  providers: ProviderCatalogItem[],
): PriceOffer[] {
  return providers
    .flatMap((provider) => displayableOffers(provider.offers))
    .filter(
      (offer) => offer.status !== "pending" && offer.status !== "unpublished",
    )
    .sort(
      (a, b) =>
        (a.modelOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.modelOrder ?? Number.MAX_SAFE_INTEGER) ||
        (a.planName ?? "").localeCompare(b.planName ?? "", "zh-CN"),
    );
}
