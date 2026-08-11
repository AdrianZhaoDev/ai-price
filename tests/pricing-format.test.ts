import { describe, expect, it } from "vitest";
import {
  displayableOffers,
  compareCnyPrice,
  API_INITIAL_VISIBLE_COUNT,
  formatApiCny,
  formatCny,
  formatFxRate,
  formatOfferAnnotation,
  formatOfferDisplayPrice,
  formatOfferPlanName,
  formatOfferPrice,
  formatOfferUnit,
  formatPeriod,
  formatProviderDescription,
  formatRegionName,
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

  it("localizes region names from stable region codes", () => {
    expect(
      formatRegionName({ regionCode: "US", regionName: "美国" }, "en"),
    ).toBe("United States");
    expect(
      formatRegionName({ regionCode: "US", regionName: "美国" }, "zh-CN"),
    ).toBe("美国");
    expect(formatRegionName({ regionName: "全球" }, "en")).toBe("Global");
    expect(formatRegionName({ regionName: "未知地区" }, "en", "Region")).toBe(
      "Region",
    );
  });

  it("localizes explanatory pricing data while preserving product names", () => {
    const provider = {
      id: "chatgpt",
      name: "ChatGPT",
      description: "OpenAI 官方 iOS 应用订阅",
      mode: "global" as const,
      sourceType: "app_store" as const,
    };
    expect(formatProviderDescription(provider, "en")).toBe(
      "Official OpenAI iOS app subscriptions",
    );
    expect(formatProviderDescription(provider, "zh-CN")).toBe(
      "OpenAI 官方 iOS 应用订阅",
    );
    expect(
      formatOfferPlanName(
        {
          planName: "gpt-5.6 · 缓存输入",
          modelName: "gpt-5.6",
          priceTier: undefined,
          priceType: "cached_input",
        },
        "en",
      ),
    ).toBe("gpt-5.6 · Cached input");
    expect(
      formatOfferPlanName(
        {
          planName: "个人专业版",
          modelName: undefined,
          priceTier: undefined,
          priceType: undefined,
        },
        "en",
      ),
    ).toBe("个人专业版");
    expect(
      formatOfferPlanName(
        {
          planName: "Gemini 2.5 Pro · 输入 · 长上下文 · 档位 2",
          modelName: "Gemini 2.5 Pro",
          priceTier: "长上下文 · 档位 2",
          priceType: "input",
        },
        "en",
      ),
    ).toBe("Gemini 2.5 Pro · Input · Long context · Variant 2");
    expect(
      formatOfferAnnotation({ note: "含 5 TB 存储" }, provider, "en"),
    ).toBe("Includes 5 TB storage");
    expect(formatOfferUnit("50,000 积分/月", "en")).toBe(
      "50,000 credits/month",
    );
    expect(formatOfferUnit("1.3亿 Tokens / 月", "en")).toBe(
      "130M Tokens/month",
    );
    expect(formatOfferUnit("/百万 tokens（Token Plan 折算）", "en")).toBe(
      "/million tokens (Token Plan equivalent)",
    );
  });

  it("localizes non-numeric source price states", () => {
    expect(
      formatOfferDisplayPrice(
        {
          ...offer,
          amountMinor: null,
          currency: null,
          displayPrice: "等待首次核验",
          status: "pending",
        },
        "en",
      ),
    ).toBe("Awaiting first verification");
    expect(
      formatOfferDisplayPrice(
        {
          ...offer,
          amountMinor: null,
          currency: null,
          displayPrice: "输入 ¥1 · 输出 ¥4",
        },
        "en",
      ),
    ).toBe("Input ¥1 · Output ¥4");
    expect(
      formatOfferDisplayPrice(
        {
          ...offer,
          amountMinor: null,
          currency: null,
          displayPrice: "新的官方价格说明",
        },
        "en",
      ),
    ).toBe("See official source");
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
      formatOfferPrice(
        { ...offer, currency: "CNY", displayPrice: "¥49/月" },
        "en",
      ),
    ).toBe("¥49/month");
    expect(formatOfferPrice({ ...offer, displayPrice: "$19.99/month" })).toBe(
      "$19.99/月",
    );
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
