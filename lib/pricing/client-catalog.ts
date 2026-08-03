import {
  apiRankingEntries,
  type ApiRankingMetric,
} from "@/lib/pricing/api-ranking";
import {
  API_INITIAL_VISIBLE_COUNT,
  displayableOffers,
} from "@/lib/pricing/format";
import type {
  PriceMode,
  PriceOffer,
  ProviderCatalogItem,
} from "@/lib/pricing/types";

const rankingMetrics: ApiRankingMetric[] = ["cached_input", "input", "output"];

export function prepareProvidersForClient(
  providers: ProviderCatalogItem[],
  mode: PriceMode,
  preferredProviderId?: string,
): {
  providers: ProviderCatalogItem[];
  deferredProviderIds: string[];
} {
  const sortedProviders = [...providers].sort(
    (a, b) =>
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER),
  );
  const primaryProvider =
    sortedProviders.find(
      (provider) =>
        provider.id === preferredProviderId &&
        displayableOffers(provider.offers).length > 0,
    ) ??
    sortedProviders.find(
      (provider) => displayableOffers(provider.offers).length > 0,
    );
  const rankingOffers = new Map<string, Map<string, PriceOffer>>();

  if (mode === "api") {
    for (const metric of rankingMetrics) {
      for (const entry of apiRankingEntries(providers, metric)) {
        const providerOffers =
          rankingOffers.get(entry.providerId) ?? new Map<string, PriceOffer>();
        for (const offer of [entry.cachedInput, entry.input, entry.output]) {
          if (offer) providerOffers.set(offer.id, offer);
        }
        rankingOffers.set(entry.providerId, providerOffers);
      }
    }
  }

  const deferredProviderIds: string[] = [];
  const clientProviders = sortedProviders.map((provider) => {
    if (provider.id === primaryProvider?.id) return provider;

    const displayable = displayableOffers(provider.offers);
    const summaries = [...(rankingOffers.get(provider.id)?.values() ?? [])];
    const offers =
      summaries.length > 0
        ? summaries
        : displayable.slice(0, mode === "api" ? API_INITIAL_VISIBLE_COUNT : 1);

    if (offers.length < provider.offers.length) {
      deferredProviderIds.push(provider.id);
    }
    return { ...provider, offers };
  });

  return { providers: clientProviders, deferredProviderIds };
}
