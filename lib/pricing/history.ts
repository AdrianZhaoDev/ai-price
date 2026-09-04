import { and, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { getReadDatabase, isReadDatabaseConfigured } from "@/lib/db/client";
import {
  plans,
  priceChangeEvents,
  priceObservations,
  products,
  sources,
} from "@/lib/db/schema";
import { PRICING_PAGE_CACHE_TAG } from "./page-cache";
import type { SubscriptionHistory } from "./history-types";

export const SUBSCRIPTION_HISTORY_LIMIT = 100;

export const loadSubscriptionHistory = unstable_cache(
  async (providerId = ""): Promise<SubscriptionHistory> => {
    if (!isReadDatabaseConfigured())
      return {
        available: false,
        limit: SUBSCRIPTION_HISTORY_LIMIT,
        events: [],
      };
    const previous = alias(priceObservations, "previous_price");
    const current = alias(priceObservations, "current_price");
    const rows = await getReadDatabase()
      .select({
        id: priceChangeEvents.id,
        providerId: products.slug,
        providerName: products.name,
        planId: plans.canonicalSlug,
        planName: plans.name,
        regionCode: current.storefront,
        regionName: current.region,
        currency: current.currency,
        previousAmountMinor: previous.amountMinor,
        currentAmountMinor: current.amountMinor,
        previousDisplayPrice: previous.displayPrice,
        currentDisplayPrice: current.displayPrice,
        billingPeriod: current.billingPeriod,
        confirmedAt: priceChangeEvents.createdAt,
        sourceUrl: sources.url,
      })
      .from(priceChangeEvents)
      .innerJoin(
        previous,
        eq(previous.id, priceChangeEvents.previousObservationId),
      )
      .innerJoin(
        current,
        eq(current.id, priceChangeEvents.currentObservationId),
      )
      .innerJoin(plans, eq(plans.id, priceChangeEvents.planId))
      .innerJoin(products, eq(products.id, plans.productId))
      .innerJoin(sources, eq(sources.id, current.sourceId))
      .where(
        and(
          ne(products.mode, "api"),
          eq(products.enabled, true),
          eq(sources.enabled, true),
          providerId ? eq(products.slug, providerId) : undefined,
          eq(previous.currency, current.currency),
          eq(previous.billingPeriod, current.billingPeriod),
          eq(previous.sourceId, current.sourceId),
          sql`${previous.storefront} is not distinct from ${current.storefront}`,
          sql`${previous.amountMinor} >= 0 and ${current.amountMinor} >= 0`,
          ne(previous.amountMinor, current.amountMinor),
        ),
      )
      .orderBy(desc(priceChangeEvents.createdAt), priceChangeEvents.id)
      .limit(SUBSCRIPTION_HISTORY_LIMIT);
    return {
      available: true,
      limit: SUBSCRIPTION_HISTORY_LIMIT,
      events: rows.map((row) => ({
        ...row,
        previousAmountMinor: row.previousAmountMinor!,
        currentAmountMinor: row.currentAmountMinor!,
        confirmedAt: row.confirmedAt.toISOString(),
      })),
    };
  },
  ["subscription-price-history-v1"],
  { tags: [PRICING_PAGE_CACHE_TAG], revalidate: 900 },
);
