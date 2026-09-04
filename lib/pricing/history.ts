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
// App Store can list monthly and annual prices under the same unqualified name.
// Match billing language, not bare words such as "year" in "year-round".
const EXPLICIT_BILLING_PERIOD =
  "(^|[^a-z])(weekly|monthly|quarterly|yearly|annually|annual|lifetime|one[ -]?time)([^a-z]|$)|(/[[:space:]]*|(^|[^a-z])per[[:space:]]+|[0-9]+[ -]+)(week|month|quarter|year)s?([^a-z]|$)|(^|[^a-z])(week|month|quarter|year)[ -]+(plan|subscription|membership)([^a-z]|$)|(按|每|包)[周月季年]|[周月季年](付|费|卡|度|期)|一次性|永久";

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
          // The collector uses the same 6x threshold to infer annual prices
          // when both prices occur in one response. Across responses the period
          // can remain ambiguous, even after two matching price observations.
          sql`not (
            ${sources.type} = 'app_store'
            and ${previous.amountMinor} > 0 and ${current.amountMinor} > 0
            and greatest(${previous.amountMinor}, ${current.amountMinor}) >=
              least(${previous.amountMinor}, ${current.amountMinor}) * 6
            and (
              ${previous.rawPlanName} !~* ${EXPLICIT_BILLING_PERIOD}
              or ${current.rawPlanName} !~* ${EXPLICIT_BILLING_PERIOD}
            )
          )`,
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
  ["subscription-price-history-v2"],
  { tags: [PRICING_PAGE_CACHE_TAG], revalidate: 900 },
);
