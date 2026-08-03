import type {
  ApiPriceType,
  PriceOffer,
  ProviderCatalogItem,
} from "@/lib/pricing/types";

export type ApiRankingMetric = "cached_input" | "input" | "output";

export type ApiRankingEntry = {
  id: string;
  providerId: string;
  providerName: string;
  providerColor: string;
  modelSlug: string;
  modelName: string;
  modelOrder: number;
  cachedInput?: PriceOffer;
  input?: PriceOffer;
  output?: PriceOffer;
};

export type ApiRankingChange = {
  metric: ApiRankingMetric;
  entryId: string;
  previousRank: number | null;
  currentRank: number;
  rankDelta: number | null;
  previousPriceCny: number | null;
  currentPriceCny: number | null;
  previousDisplayPrice: string | null;
  currentDisplayPrice: string | null;
  priceDirection: "increase" | "decrease" | null;
  isNew: boolean;
  changedAt: string;
};

export function rankingCnyValue(offer: PriceOffer | undefined): number {
  if (!offer) return Number.POSITIVE_INFINITY;
  if (offer.convertedCny !== undefined && Number.isFinite(offer.convertedCny)) {
    return offer.convertedCny;
  }
  if (
    offer.currency?.toUpperCase() === "CNY" &&
    offer.amountMinor !== null &&
    Number.isFinite(offer.amountMinor)
  ) {
    return offer.amountMinor / 100;
  }
  return Number.POSITIVE_INFINITY;
}

function inferredPriceType(offer: PriceOffer): ApiPriceType {
  if (offer.priceType) return offer.priceType;
  const text = offer.planName.toLowerCase();
  if (/缓存.*写|cache.*write/.test(text)) return "cache_write";
  if (/缓存|cache|命中/.test(text)) return "cached_input";
  if (/输出|output/.test(text)) return "output";
  if (/输入|input/.test(text)) return "input";
  return "other";
}

function metricOffer(
  offers: PriceOffer[],
  type: ApiRankingMetric,
): PriceOffer | undefined {
  return offers
    .filter((offer) => inferredPriceType(offer) === type)
    .sort(
      (a, b) =>
        (a.tierOrder ?? 0) - (b.tierOrder ?? 0) ||
        rankingCnyValue(a) - rankingCnyValue(b),
    )[0];
}

export function rankingOfferForMetric(
  entry: ApiRankingEntry,
  metric: ApiRankingMetric,
): PriceOffer | undefined {
  return metric === "cached_input"
    ? entry.cachedInput
    : metric === "input"
      ? entry.input
      : entry.output;
}

function modelIdentity(offer: PriceOffer): { slug: string; name: string } {
  const name =
    offer.modelName ?? offer.planName.split(/\s*·\s*/)[0]?.trim() ?? "模型";
  return {
    slug: offer.modelSlug ?? name.toLowerCase().replace(/\s+/g, "-"),
    name,
  };
}

export function apiRankingEntries(
  providers: ProviderCatalogItem[],
  metric: ApiRankingMetric,
): ApiRankingEntry[] {
  const entries: ApiRankingEntry[] = [];

  for (const provider of providers.filter((item) => item.mode === "api")) {
    const tokenOffers = provider.offers.filter(
      (offer) =>
        offer.status !== "pending" &&
        offer.status !== "unpublished" &&
        offer.rankingEligible !== false &&
        Number.isFinite(rankingCnyValue(offer)) &&
        offer.unit?.replace(/\s+/g, " ").trim() === "/百万 tokens",
    );
    const models = new Map<
      string,
      { name: string; order: number; offers: PriceOffer[] }
    >();
    for (const offer of tokenOffers) {
      const identity = modelIdentity(offer);
      const current = models.get(identity.slug);
      if (current) {
        current.offers.push(offer);
        current.order = Math.min(
          current.order,
          offer.modelOrder ?? Number.MAX_SAFE_INTEGER,
        );
      } else {
        models.set(identity.slug, {
          name: identity.name,
          order: offer.modelOrder ?? Number.MAX_SAFE_INTEGER,
          offers: [offer],
        });
      }
    }

    const latestModels = [...models.entries()]
      .sort(
        ([, a], [, b]) =>
          a.order - b.order || a.name.localeCompare(b.name, "zh-CN"),
      )
      .slice(0, 2);
    for (const [modelSlug, model] of latestModels) {
      entries.push({
        id: `${provider.id}-${modelSlug}`,
        providerId: provider.id,
        providerName: provider.label,
        providerColor: provider.color,
        modelSlug,
        modelName: model.name,
        modelOrder: model.order,
        cachedInput: metricOffer(model.offers, "cached_input"),
        input: metricOffer(model.offers, "input"),
        output: metricOffer(model.offers, "output"),
      });
    }
  }

  return entries
    .filter((entry) =>
      Number.isFinite(rankingCnyValue(rankingOfferForMetric(entry, metric))),
    )
    .sort((a, b) => {
      const aValue = rankingCnyValue(rankingOfferForMetric(a, metric));
      const bValue = rankingCnyValue(rankingOfferForMetric(b, metric));
      return (
        aValue - bValue ||
        a.providerName.localeCompare(b.providerName, "zh-CN") ||
        a.modelOrder - b.modelOrder
      );
    });
}
