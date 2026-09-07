import { describe, expect, it } from "vitest";
import { syntheticChannelOffers } from "@/lib/channels/fixture";
import {
  buildChannelMerchantSummaries,
  buildChannelProductSummaries,
  dedupeChannelOffers,
  filterChannelOffers,
  isOfferAvailable,
  effectiveChannelAvailability,
  isOfferEligibleForLowestPrice,
  rankChannelOffers,
  selectLowestAvailableOffer,
  sortChannelOffers,
} from "@/lib/channels/ranking";
import type { ChannelOffer } from "@/lib/channels/types";

const referenceNow = new Date("2026-09-06T01:00:00.000Z");

function offer(overrides: Partial<ChannelOffer> = {}): ChannelOffer {
  return {
    ...syntheticChannelOffers[0],
    ...overrides,
    tiers:
      overrides.tiers ??
      syntheticChannelOffers[0].tiers.map((tier) => ({ ...tier })),
    labels: overrides.labels ?? [...syntheticChannelOffers[0].labels],
    riskLabels: overrides.riskLabels ?? [
      ...syntheticChannelOffers[0].riskLabels,
    ],
  };
}

describe("channel availability and ranking", () => {
  it.each(["price_asc", "price_desc"] as const)(
    "keeps unknown prices last in %s",
    (sort) => {
      const rows = [
        offer({ id: "unknown", priceMinor: null }),
        offer({ id: "cheap", priceMinor: 100 }),
        offer({ id: "expensive", priceMinor: 200 }),
      ];
      expect(
        sortChannelOffers(rows, sort, { now: referenceNow }).map(
          (row) => row.id,
        ),
      ).toEqual(
        sort === "price_asc"
          ? ["cheap", "expensive", "unknown"]
          : ["expensive", "cheap", "unknown"],
      );
    },
  );
  it("does not label or count stale inventory as currently available", () => {
    const stale = offer({
      lastSeenAt: "2026-09-01T00:00:00Z",
      sourceHealth: "unknown",
      availabilityStatus: "in_stock",
    });
    expect(effectiveChannelAvailability(stale, referenceNow)).toBe("unknown");
    expect(isOfferAvailable(stale, referenceNow)).toBe(false);
    expect(
      buildChannelProductSummaries([stale], { now: referenceNow })[0]
        .availableOfferCount,
    ).toBe(0);
    expect(
      buildChannelMerchantSummaries([stale], { now: referenceNow })[0]
        .availableOfferCount,
    ).toBe(0);
  });
  it("prefers healthy sources on price ties before recency or source type", () => {
    const healthy = offer({
      id: "healthy",
      sourceHealth: "healthy",
      sourceType: "manual_snapshot",
      lastSeenAt: "2026-09-06T00:00:00Z",
    });
    const unknown = offer({
      id: "unknown",
      sourceHealth: "unknown",
      sourceType: "public_api",
      lastSeenAt: "2026-09-06T01:00:00Z",
    });
    for (const sort of ["price_asc", "price_desc"] as const)
      expect(
        sortChannelOffers([unknown, healthy], sort).map((row) => row.id),
      ).toEqual(["healthy", "unknown"]);
  });
  it("normalizes helper aliases and field-specific default directions", () => {
    const cheap = offer({ id: "cheap", priceMinor: 100 });
    const expensive = offer({ id: "expensive", priceMinor: 200 });
    expect(
      sortChannelOffers([cheap, expensive], { by: "price_desc" })[0].id,
    ).toBe("expensive");
    expect(
      sortChannelOffers([cheap, expensive], {
        by: "price_desc",
        direction: "asc",
      })[0].id,
    ).toBe("cheap");
    const exact = offer({ id: "exact", productName: "needle" });
    const partial = offer({
      id: "partial",
      productName: "other needle",
      rawTitle: "other",
      merchantName: "other",
    });
    expect(
      sortChannelOffers([partial, exact], {
        by: "relevance",
        query: "needle",
      })[0].id,
    ).toBe("exact");
    expect(
      sortChannelOffers(
        [offer({ availabilityStatus: "out_of_stock" }), cheap],
        "availability",
      )[0].id,
    ).toBe("cheap");
  });
  it("declines cross-currency minimum and top-five awards without conversion", () => {
    const offers = [
      offer({
        id: "cny",
        currency: "CNY",
        priceMinor: 1000,
        publicDedupeKey: "cny",
      }),
      offer({
        id: "usd",
        currency: "USD",
        priceMinor: 100,
        publicDedupeKey: "usd",
      }),
    ];
    expect(
      selectLowestAvailableOffer(offers, { now: referenceNow }),
    ).toBeUndefined();
    expect(
      selectLowestAvailableOffer(offers, { now: referenceNow, currency: "USD" })
        ?.id,
    ).toBe("usd");
    const summary = buildChannelProductSummaries(offers, {
      now: referenceNow,
    })[0];
    expect(summary.multipleCurrencies).toBe(true);
    expect(summary.lowestPriceMinor).toBeUndefined();
    expect(
      buildChannelMerchantSummaries(offers, { now: referenceNow }).every(
        (merchant) =>
          merchant.lowestPriceHits === 0 && merchant.topFiveHits === 0,
      ),
    ).toBe(true);
  });
  it("filters and labels availability from expiry and stock evidence", () => {
    const expired = offer({
      id: "expired-evidence",
      expiresAt: "2020-01-01T00:00:00Z",
    });
    const empty = offer({ id: "empty-evidence", stockQuantity: 0 });
    expect(effectiveChannelAvailability(expired)).toBe("expired");
    expect(effectiveChannelAvailability(empty)).toBe("out_of_stock");
    expect(
      filterChannelOffers([expired, empty], { availability: "in_stock" }),
    ).toEqual([]);
    expect(
      filterChannelOffers([expired, empty], { availability: "expired" }).map(
        (row) => row.id,
      ),
    ).toEqual([expired.id]);
    expect(
      filterChannelOffers([expired, empty], {
        availability: "out_of_stock",
      }).map((row) => row.id),
    ).toEqual([empty.id]);
  });
  it("keeps unknown, sold-out and expired rows out of lowest price", () => {
    const soldOut = offer({
      id: "sold-out",
      availabilityStatus: "out_of_stock",
      stockQuantity: 0,
    });
    const unknown = offer({ id: "unknown", availabilityStatus: "unknown" });
    const expired = offer({
      id: "expired",
      expiresAt: "2026-09-06T00:00:00.000Z",
    });
    const healthy = offer({ id: "healthy", priceMinor: 1200 });

    expect(isOfferAvailable(soldOut, referenceNow)).toBe(false);
    expect(isOfferAvailable(unknown, referenceNow)).toBe(false);
    expect(isOfferAvailable(expired, referenceNow)).toBe(false);
    expect(isOfferAvailable(healthy, referenceNow)).toBe(true);
    expect(isOfferEligibleForLowestPrice(healthy, referenceNow)).toBe(true);
    expect(
      isOfferEligibleForLowestPrice(
        offer({ id: "degraded", sourceHealth: "degraded" }),
        referenceNow,
      ),
    ).toBe(false);
  });

  it("deduplicates by public key using availability, source priority and freshness", () => {
    const first = offer({
      id: "duplicate-page",
      sourceType: "public_page",
      sourceHealth: "healthy",
      publicDedupeKey: "same-offer",
      lastSeenAt: "2026-09-05T20:00:00.000Z",
    });
    const second = offer({
      id: "duplicate-api",
      sourceType: "public_api",
      sourceHealth: "healthy",
      publicDedupeKey: "same-offer",
      lastSeenAt: "2026-09-05T19:00:00.000Z",
    });
    const soldOut = offer({
      id: "duplicate-sold-out",
      sourceType: "authorized_feed",
      availabilityStatus: "out_of_stock",
      stockQuantity: 0,
      publicDedupeKey: "same-offer",
      lastSeenAt: "2026-09-06T00:30:00.000Z",
    });
    const input = [first, second, soldOut];
    const result = dedupeChannelOffers(input, { now: referenceNow });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("duplicate-api");
    expect(input.map((item) => item.id)).toEqual([
      "duplicate-page",
      "duplicate-api",
      "duplicate-sold-out",
    ]);
  });

  it("filters by query, merchant, availability and minor-unit price", () => {
    const filtered = filterChannelOffers(syntheticChannelOffers, {
      query: "cloudbox basic",
      merchantIds: ["synthetic-merchant-alpha"],
      availability: "in_stock",
      maxPriceMinor: 1000,
    });
    expect(filtered.map((item) => item.id)).toEqual([
      "synthetic-offer-basic-alpha-api",
      "synthetic-offer-basic-alpha-page-duplicate",
    ]);
  });

  it("sorts deterministically without comparing unlike currencies", () => {
    const rows = [
      offer({ id: "usd-1", currency: "USD", priceMinor: 1 }),
      offer({ id: "cny-2", currency: "CNY", priceMinor: 200 }),
      offer({ id: "cny-1", currency: "CNY", priceMinor: 100 }),
      offer({ id: "unavailable", availabilityStatus: "out_of_stock" }),
    ];
    expect(sortChannelOffers(rows, "price_asc").map((item) => item.id)).toEqual(
      ["cny-1", "cny-2", "usd-1", "unavailable"],
    );
    expect(
      sortChannelOffers(rows, "price_desc").map((item) => item.id),
    ).toEqual(["usd-1", "cny-2", "cny-1", "unavailable"]);
  });

  it("builds product and merchant metrics from eligible offers", () => {
    const products = buildChannelProductSummaries(syntheticChannelOffers, {
      now: referenceNow,
    });
    const basic = products.find(
      (item) => item.productId === "synthetic-product-cloudbox-basic",
    );
    expect(basic).toMatchObject({
      offerCount: 3,
      availableOfferCount: 2,
      merchantCount: 2,
      lowestPriceMinor: 990,
      lowestOfferId: "synthetic-offer-basic-alpha-api",
    });

    const merchants = buildChannelMerchantSummaries(syntheticChannelOffers, {
      now: referenceNow,
    });
    const alpha = merchants.find(
      (item) => item.merchantId === "synthetic-merchant-alpha",
    );
    expect(alpha).toMatchObject({
      offerCount: 2,
      availableOfferCount: 2,
      productCount: 2,
      lowestPriceHits: 2,
    });
  });

  it("applies bounded pagination after dedupe and sort", () => {
    const rows = rankChannelOffers(
      syntheticChannelOffers,
      { availability: "in_stock", limit: 2, offset: 1, sort: "price" },
      { now: referenceNow },
    );
    expect(rows.map((item) => item.id)).toEqual([
      "synthetic-offer-basic-beta",
      "synthetic-offer-pro-alpha",
    ]);
    expect(
      selectLowestAvailableOffer(syntheticChannelOffers, { now: referenceNow })
        ?.id,
    ).toBe("synthetic-offer-basic-alpha-api");
  });
});
