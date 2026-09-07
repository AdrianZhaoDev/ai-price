import { describe, expect, it } from "vitest";
import {
  channelOfferFiltersSchema,
  channelOfferSchema,
  parseChannelOffer,
  parseChannelOfferFilters,
  validateChannelOffer,
} from "@/lib/channels/types";
import { syntheticChannelOffers } from "@/lib/channels/fixture";

describe("channels contracts", () => {
  it("keeps the development fixture explicitly synthetic and valid", () => {
    expect(syntheticChannelOffers.length).toBeGreaterThan(0);
    for (const offer of syntheticChannelOffers) {
      expect(channelOfferSchema.safeParse(offer).success).toBe(true);
      expect(offer.riskLabels).toContain("synthetic_data");
      expect(offer.offerUrl).toContain("synthetic.invalid");
    }
  });

  it("normalizes the planned database column aliases", () => {
    const result = validateChannelOffer({
      id: "row-1",
      merchant_id: "merchant-1",
      merchant_name: "Merchant 1",
      product_id: "product-1",
      product_name: "Product 1",
      source_name: "public catalog",
      source_url: "https://merchant.example/source",
      title: "Product 1 — 30 days",
      offer_url: "https://merchant.example/offer",
      price_minor: "1299",
      currency: "cny",
      availability: "in-stock",
      stock_count: "3",
      min_order_quantity: "1",
      observed_at: new Date("2026-09-06T00:00:00.000Z"),
      last_seen_at: new Date("2026-09-06T00:00:00.000Z"),
      status: "published",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.priceMinor).toBe(1299);
    expect(result.data.currency).toBe("CNY");
    expect(result.data.availabilityStatus).toBe("in_stock");
    expect(result.data.stockQuantity).toBe(3);
    expect(result.data.minPurchaseQuantity).toBe(1);
    expect(result.data.publicationStatus).toBe("published");
  });

  it("rejects malformed links and unsafe money values", () => {
    const fixture = syntheticChannelOffers[0];
    expect(
      validateChannelOffer({ ...fixture, offerUrl: "not-a-url" }).success,
    ).toBe(false);
    expect(validateChannelOffer({ ...fixture, priceMinor: -1 }).success).toBe(
      false,
    );
    expect(validateChannelOffer({ ...fixture, currency: "RMB" }).success).toBe(
      true,
    );
    expect(validateChannelOffer({ ...fixture, currency: "CN" }).success).toBe(
      false,
    );
  });

  it("parses bounded URL-style filters and rejects invalid ranges", () => {
    const filters = parseChannelOfferFilters({
      q: "  cloudbox ",
      merchant: "synthetic-merchant-alpha,synthetic-merchant-beta",
      availability: "available",
      priceMax: "1500",
      limit: "10",
      offset: "2",
      published_only: "true",
      sort: "price_asc",
    });
    expect(filters.query).toBe("cloudbox");
    expect(filters.merchantIds).toEqual([
      "synthetic-merchant-alpha",
      "synthetic-merchant-beta",
    ]);
    expect(filters.availability).toBe("in_stock");
    expect(filters.maxPriceMinor).toBe(1500);
    expect(filters.limit).toBe(10);
    expect(filters.offset).toBe(2);
    expect(filters.sort).toBe("price");

    expect(channelOfferFiltersSchema.safeParse({ limit: 0 }).success).toBe(
      false,
    );
    expect(
      channelOfferFiltersSchema.safeParse({ maxPriceMinor: -1 }).success,
    ).toBe(false);
  });

  it("does not mutate parsed values when callers reuse the input", () => {
    const input = { ...syntheticChannelOffers[0], currency: "usd" };
    const parsed = parseChannelOffer(input);
    expect(input.currency).toBe("usd");
    expect(parsed.currency).toBe("USD");
  });
});
