import { modes } from "@/lib/data/catalog";
import { prepareProvidersForClient } from "@/lib/pricing/client-catalog";
import { displayableOffers } from "@/lib/pricing/format";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import type { PriceMode } from "@/lib/pricing/types";
import { unstable_cache } from "next/cache";

export const PRICING_PAGE_CACHE_TAG = "pricing-page-data";
export const PRICING_PAGE_REVALIDATE_SECONDS = 900;

export const loadCachedPricingPageData = unstable_cache(
  async (mode: PriceMode) => {
    const modeProviders = (await loadProviderCatalog(mode)).sort(
      (a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) -
        (b.rank ?? Number.MAX_SAFE_INTEGER),
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
      clientCatalog: prepareProvidersForClient(modeProviders, mode),
      providerSources: modeProviders.map((provider) => ({
        name: provider.name,
        sourceUrl: provider.sourceUrl,
      })),
    };
  },
  ["pricing-page-data-v3"],
  {
    revalidate: PRICING_PAGE_REVALIDATE_SECONDS,
    tags: [PRICING_PAGE_CACHE_TAG],
  },
);

export async function warmPricingPageData() {
  await Promise.all(modes.map((mode) => loadCachedPricingPageData(mode.id)));
}
