import { describe, expect, it } from "vitest";
import {
  displayableOffers,
  compareCnyPrice,
  API_INITIAL_VISIBLE_COUNT,
  formatApiCny,
  formatCny,
  formatFxRate,
  formatOfferPrice,
  formatPeriod,
  isComparableOffer,
  lowestComparableOffer,
  lowestThreeRanks,
  plansByMinimumPrice,
  sortOffersByCny,
  statusLabel,
  visibleApiOffers,
} from "@/lib/pricing/format";
import type { PriceOffer } from "@/lib/pricing/types";

const offer: PriceOffer = {
  id: "offer",
  planId: "plan",
  planName: "Plan",
  amountMinor: 1999,
  currency: "USD",
  displayPrice: "$19.99",
  billingPeriod: "month",
  convertedCny: 143.25,
  status: "verified",
};

describe("price formatting", () => {
  it("formats every billing period", () => {
    expect(
      ["week", "month", "quarter", "year", "one_time", "usage"].map((period) =>
        formatPeriod(period as PriceOffer["billingPeriod"]),
      ),
    ).toEqual(["/周", "/月", "/季", "/年", "一次性", ""]);
  });

  it("formats CNY references and missing values", () => {
    expect(formatCny()).toBe("—");
    expect(formatCny(Number.NaN)).toBe("—");
    expect(formatCny(49.5)).toContain("49.5");
    expect(formatCny(143.25)).toContain("143");
    expect(formatApiCny(0.025)).toBe("¥0.025");
    expect(formatApiCny(6.999999)).toBe("¥6.999999");
    expect(formatApiCny(Number.NaN)).toBe("—");
  });

  it("formats persisted or derived exchange rates and price comparisons", () => {
    expect(formatFxRate({ ...offer, fxRate: 7.166 })).toBe("1 USD ≈ ¥7.166");
    expect(
      formatFxRate({
        ...offer,
        currency: "JPY",
        amountMinor: 3_000,
        convertedCny: 124.43,
        fxRate: undefined,
      }),
    ).toBe("1 JPY ≈ ¥0.0415");
    expect(compareCnyPrice(109.52, 109.52)?.isMinimum).toBe(true);
    expect(compareCnyPrice(119.05, 109.52)).toMatchObject({
      isMinimum: false,
      difference: 9.53,
    });
  });

  it("uses display text for pending offers", () => {
    expect(formatOfferPrice(offer)).toBe("$19.99/月");
    expect(
      formatOfferPrice({
        ...offer,
        currency: "CNY",
        displayPrice: "¥49/月",
      }),
    ).toBe("¥49/月");
    expect(
      formatOfferPrice({
        ...offer,
        amountMinor: null,
        currency: null,
        displayPrice: "等待采集",
      }),
    ).toBe("等待采集");
  });

  it("labels statuses and selects the lowest comparable offer", () => {
    expect(statusLabel("verified")).toBe("已核验");
    expect(statusLabel("stale")).toBe("可能过期");
    expect(statusLabel("pending")).toBe("等待采集");
    expect(statusLabel("unpublished")).toBe("未公开固定价");
    expect(isComparableOffer(offer)).toBe(true);
    expect(isComparableOffer({ ...offer, status: "stale" })).toBe(false);
    expect(
      lowestComparableOffer([
        { ...offer, id: "high", convertedCny: 200 },
        { ...offer, id: "low", convertedCny: 100 },
        { ...offer, id: "pending", amountMinor: null },
      ])?.id,
    ).toBe("low");
    expect(lowestComparableOffer([])).toBeUndefined();
  });

  it("hides availability and duplicate annual labels, then ranks by RMB", () => {
    const offers: PriceOffer[] = [
      { ...offer, id: "monthly", convertedCny: 140 },
      {
        ...offer,
        id: "annual",
        planId: "plan-annual",
        billingPeriod: "year",
        convertedCny: 1_000,
      },
      {
        ...offer,
        id: "availability",
        planId: "chatgpt-availability",
        amountMinor: null,
        convertedCny: undefined,
      },
      { ...offer, id: "low", planName: "Low", convertedCny: 40 },
      { ...offer, id: "mid", planName: "Mid", convertedCny: 80 },
      { ...offer, id: "high", planName: "High", convertedCny: 120 },
    ];
    const visible = displayableOffers(offers);
    expect(visible.map((item) => item.id)).not.toContain("annual");
    expect(visible.map((item) => item.id)).not.toContain("availability");
    expect(sortOffersByCny(visible, "desc")[0].id).toBe("monthly");
    expect([...lowestThreeRanks(visible)]).toEqual([
      ["low", 1],
      ["mid", 2],
      ["high", 3],
    ]);
  });

  it("limits collapsed API lists to ten offers and expands all", () => {
    const offers = Array.from(
      { length: API_INITIAL_VISIBLE_COUNT + 2 },
      (_, index) => ({ ...offer, id: `api-${index}` }),
    );
    expect(visibleApiOffers(offers, false)).toHaveLength(
      API_INITIAL_VISIBLE_COUNT,
    );
    expect(visibleApiOffers(offers, true)).toHaveLength(offers.length);
  });

  it("orders plans from cheap to expensive using each plan's global minimum", () => {
    const offers: PriceOffer[] = [
      {
        ...offer,
        id: "plus-us",
        planId: "plus",
        planName: "Plus",
        convertedCny: 135,
      },
      {
        ...offer,
        id: "plus-ph",
        planId: "plus",
        planName: "Plus",
        convertedCny: 109,
      },
      {
        ...offer,
        id: "pro-us",
        planId: "pro",
        planName: "Pro",
        convertedCny: 1_350,
      },
      {
        ...offer,
        id: "go-ph",
        planId: "go",
        planName: "Go",
        convertedCny: 28,
      },
    ];

    expect(plansByMinimumPrice(offers)).toEqual([
      { id: "go", name: "Go", minimumCny: 28 },
      { id: "plus", name: "Plus", minimumCny: 109 },
      { id: "pro", name: "Pro", minimumCny: 1_350 },
    ]);
  });
});
