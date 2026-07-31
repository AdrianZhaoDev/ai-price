import { providerCatalog } from "@/lib/data/catalog";
import { getReadDatabase, isReadDatabaseConfigured } from "@/lib/db/client";
import { plans, priceObservations, products, sources } from "@/lib/db/schema";
import type {
  PriceMode,
  PriceOffer,
  PriceStatus,
  ProviderCatalogItem,
} from "@/lib/pricing/types";
import { and, desc, eq } from "drizzle-orm";

function cloneCatalog(mode?: PriceMode): ProviderCatalogItem[] {
  return providerCatalog
    .filter((provider) => !mode || provider.mode === mode)
    .map((provider) => ({
      ...provider,
      offers: provider.offers.map((offer) => ({ ...offer })),
    }));
}

function databaseMode(mode: PriceMode) {
  return mode === "china-subscription" ? "china_subscription" : mode;
}

export async function loadProviderCatalog(
  mode?: PriceMode,
): Promise<ProviderCatalogItem[]> {
  const catalog = cloneCatalog(mode);
  if (!isReadDatabaseConfigured()) return catalog;

  try {
    const observations = await getReadDatabase()
      .selectDistinctOn([
        priceObservations.planId,
        priceObservations.sourceId,
        priceObservations.storefront,
      ])
      .from(priceObservations)
      .innerJoin(plans, eq(plans.id, priceObservations.planId))
      .innerJoin(products, eq(products.id, plans.productId))
      .innerJoin(sources, eq(sources.id, priceObservations.sourceId))
      .where(
        mode
          ? and(eq(plans.active, true), eq(products.mode, databaseMode(mode)))
          : eq(plans.active, true),
      )
      .orderBy(
        priceObservations.planId,
        priceObservations.sourceId,
        priceObservations.storefront,
        desc(priceObservations.observedAt),
      );

    const hydratedProviderIds = new Set<string>();
    for (const row of observations) {
      const provider = catalog.find((item) => item.id === row.products.slug);
      if (!provider) continue;
      if (!hydratedProviderIds.has(provider.id)) {
        provider.offers = [];
        hydratedProviderIds.add(provider.id);
      }
      const observation = row.price_observations;
      const plan = row.plans;
      const metadata = plan.metadata ?? {};
      const source = row.sources;
      const status: PriceStatus =
        source.consecutiveFailures > 0 ? "stale" : observation.status;
      const offer: PriceOffer = {
        id: `${plan.canonicalSlug}-${observation.storefront ?? "cn"}`,
        planId: plan.canonicalSlug,
        planName: plan.name,
        amountMinor: observation.amountMinor,
        currency: observation.currency,
        displayPrice: observation.displayPrice,
        billingPeriod:
          (observation.billingPeriod as PriceOffer["billingPeriod"]) ?? "usage",
        regionCode: observation.storefront ?? undefined,
        regionName: observation.region ?? undefined,
        convertedCny: observation.convertedCny ?? undefined,
        fxRate: observation.fxRate ?? undefined,
        fxRateObservedAt: observation.fxRateObservedAt?.toISOString(),
        sourceUrl: source.url,
        unit: observation.unit ?? undefined,
        status,
        observedAt: observation.observedAt.toISOString(),
        modelName:
          typeof metadata.modelName === "string"
            ? metadata.modelName
            : undefined,
        modelSlug:
          typeof metadata.modelSlug === "string"
            ? metadata.modelSlug
            : undefined,
        modelOrder:
          typeof metadata.modelOrder === "number"
            ? metadata.modelOrder
            : undefined,
        priceType:
          metadata.priceType === "cached_input" ||
          metadata.priceType === "input" ||
          metadata.priceType === "output" ||
          metadata.priceType === "cache_write" ||
          metadata.priceType === "other"
            ? metadata.priceType
            : undefined,
        priceTier:
          typeof metadata.priceTier === "string"
            ? metadata.priceTier
            : undefined,
        tierOrder:
          typeof metadata.tierOrder === "number"
            ? metadata.tierOrder
            : undefined,
        category:
          typeof metadata.category === "string" ? metadata.category : undefined,
      };
      const matchingIndex = provider.offers.findIndex(
        (candidate) =>
          candidate.planId === offer.planId &&
          (candidate.regionCode ?? null) === (offer.regionCode ?? null),
      );
      if (matchingIndex >= 0) {
        provider.offers[matchingIndex] = offer;
      } else {
        provider.offers.push(offer);
      }
      provider.status =
        provider.status === "stale" || status === "stale"
          ? "stale"
          : "verified";
      if (
        !provider.lastCheckedAt ||
        observation.observedAt > new Date(provider.lastCheckedAt)
      ) {
        provider.lastCheckedAt = observation.observedAt.toISOString();
      }
    }
    return catalog;
  } catch (error) {
    console.error(
      "Failed to load persisted prices; using catalog seed.",
      error,
    );
    return catalog;
  }
}
