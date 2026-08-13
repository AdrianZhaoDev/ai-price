import { modes } from "@/lib/data/catalog";
import { displayableOffers } from "@/lib/pricing/format";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import { loadLatestApiRankingChanges } from "@/lib/pricing/ranking-history";
import type { PriceMode, ProviderCatalogItem } from "@/lib/pricing/types";
import { unstable_cache } from "next/cache";
import { gzipSync, gunzipSync } from "node:zlib";

export const PRICING_PAGE_CACHE_TAG = "pricing-page-data";
export const PRICING_PAGE_REVALIDATE_SECONDS = 900;

export function compressProviderCatalogForCache(
  providers: ProviderCatalogItem[],
): string {
  return gzipSync(JSON.stringify(providers)).toString("base64");
}

export function decompressProviderCatalogFromCache(
  compressed: string,
): ProviderCatalogItem[] {
  return JSON.parse(
    gunzipSync(Buffer.from(compressed, "base64")).toString("utf8"),
  ) as ProviderCatalogItem[];
}

type PricingPageData = {
  lastCheckedAt?: string;
  priceModifiedAt?: string;
  hasDisplayableMode: boolean;
  providers: ProviderCatalogItem[];
  rankingChanges: Awaited<ReturnType<typeof loadLatestApiRankingChanges>>;
  providerSources: Array<{ name: string; sourceUrl: string }>;
};

function compressPricingPageDataForCache(data: PricingPageData): string {
  return gzipSync(JSON.stringify(data)).toString("base64");
}

function decompressPricingPageDataFromCache(
  compressed: string,
): PricingPageData {
  return JSON.parse(
    gunzipSync(Buffer.from(compressed, "base64")).toString("utf8"),
  ) as PricingPageData;
}

const loadCompressedProviderCatalog = unstable_cache(
  async (mode: PriceMode, providerId: string, fallbackOnError: boolean) =>
    compressProviderCatalogForCache(
      await loadProviderCatalog(mode, providerId, { fallbackOnError }),
    ),
  ["pricing-provider-catalog-v1"],
  {
    revalidate: PRICING_PAGE_REVALIDATE_SECONDS,
    tags: [PRICING_PAGE_CACHE_TAG],
  },
);

export async function loadCachedProviderCatalog(
  mode: PriceMode,
  providerId: string,
  options: { fallbackOnError?: boolean } = {},
): Promise<ProviderCatalogItem[]> {
  return decompressProviderCatalogFromCache(
    await loadCompressedProviderCatalog(
      mode,
      providerId,
      options.fallbackOnError ?? true,
    ),
  );
}

async function loadPricingPageData(mode: PriceMode): Promise<PricingPageData> {
  const [modeProviders, rankingChanges] = await Promise.all([
    loadProviderCatalog(mode),
    mode === "api" ? loadLatestApiRankingChanges() : Promise.resolve([]),
  ]);
  modeProviders.sort(
    (a, b) =>
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    lastCheckedAt: modeProviders
      .map((provider) => provider.lastCheckedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1),
    priceModifiedAt: modeProviders
      .flatMap((provider) => provider.offers.map((offer) => offer.observedAt))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1),
    hasDisplayableMode: modeProviders.some(
      (provider) => displayableOffers(provider.offers).length > 0,
    ),
    providers: modeProviders,
    rankingChanges,
    providerSources: modeProviders.map((provider) => ({
      name: provider.name,
      sourceUrl: provider.sourceUrl,
    })),
  };
}

const loadCompressedPricingPageData = unstable_cache(
  async (mode: PriceMode) =>
    compressPricingPageDataForCache(await loadPricingPageData(mode)),
  ["pricing-page-data-v4"],
  {
    revalidate: PRICING_PAGE_REVALIDATE_SECONDS,
    tags: [PRICING_PAGE_CACHE_TAG],
  },
);

export async function loadCachedPricingPageData(mode: PriceMode) {
  return decompressPricingPageDataFromCache(
    await loadCompressedPricingPageData(mode),
  );
}

export async function warmPricingPageData() {
  await Promise.all(modes.map((mode) => loadCachedPricingPageData(mode.id)));
}
