import { describe, expect, it } from "vitest";
import { apiRankingEntries, rankingCnyValue } from "@/lib/pricing/api-ranking";
import type { PriceOffer, ProviderCatalogItem } from "@/lib/pricing/types";

function offer(
  modelName: string,
  modelOrder: number,
  priceType: PriceOffer["priceType"],
  amountMinor: number,
  overrides: Partial<PriceOffer> = {},
): PriceOffer {
  return {
    id: `${modelName}-${priceType}`,
    planId: `${modelName}-${priceType}`,
    planName: `${modelName} · ${priceType}`,
    amountMinor,
    currency: "CNY",
    displayPrice: `¥${amountMinor / 100}`,
    billingPeriod: "usage",
    unit: "/百万 tokens",
    status: "verified",
    modelName,
    modelSlug: modelName.toLowerCase(),
    modelOrder,
    priceType,
    ...overrides,
  };
}

function provider(
  id: string,
  values: Array<[string, number, number, number, number]>,
): ProviderCatalogItem {
  return {
    id,
    name: id,
    label: id,
    description: id,
    mode: "api",
    sourceUrl: "https://official.example",
    sourceLabel: "官网",
    sourceType: "official_web",
    color: "#000",
    status: "verified",
    offers: values.flatMap(([model, order, cached, input, output]) => [
      offer(model, order, "cached_input", cached),
      offer(model, order, "input", input),
      offer(model, order, "output", output),
    ]),
  };
}

describe("API ranking", () => {
  it("keeps two latest models per provider and defaults can sort by input", () => {
    const entries = apiRankingEntries(
      [
        provider("A", [
          ["A-new", 0, 10, 300, 500],
          ["A-next", 1, 20, 200, 400],
          ["A-old", 2, 1, 1, 1],
        ]),
        provider("B", [["B-new", 0, 30, 100, 600]]),
      ],
      "input",
    );
    expect(entries.map((entry) => entry.modelName)).toEqual([
      "B-new",
      "A-next",
      "A-new",
    ]);
    expect(entries.some((entry) => entry.modelName === "A-old")).toBe(false);
    expect(entries[0]).toMatchObject({
      modelSlug: "b-new",
      cachedInput: { amountMinor: 30 },
      input: { amountMinor: 100 },
      output: { amountMinor: 600 },
    });
  });

  it("allows up to ten curated global models while domestic providers stay at two", () => {
    const values = Array.from({ length: 12 }, (_, index) => [
      `Model-${index + 1}`,
      index,
      10 + index,
      20 + index,
      30 + index,
    ]) as Array<[string, number, number, number, number]>;
    const entries = apiRankingEntries(
      [provider("openai-api", values), provider("domestic-api", values)],
      "input",
    );
    expect(
      entries.filter((entry) => entry.providerId === "openai-api"),
    ).toHaveLength(10);
    expect(
      entries.filter((entry) => entry.providerId === "domestic-api"),
    ).toHaveLength(2);
  });

  it("changes ordering with the selected price metric", () => {
    const providers = [
      provider("A", [["A", 0, 100, 10, 500]]),
      provider("B", [["B", 0, 20, 30, 100]]),
    ];
    expect(apiRankingEntries(providers, "cached_input")[0].modelName).toBe("B");
    expect(apiRankingEntries(providers, "input")[0].modelName).toBe("A");
    expect(apiRankingEntries(providers, "output")[0].modelName).toBe("B");
  });

  it("sorts mixed CNY and USD offers by precise RMB value", () => {
    const cny = provider("CNY", [["CNY", 0, 100, 700, 900]]);
    const usd = provider("USD", [["USD", 0, 10, 100, 200]]);
    usd.offers = usd.offers.map((item) => ({
      ...item,
      currency: "USD",
      displayPrice: `$${(item.amountMinor ?? 0) / 100}`,
      convertedCny:
        item.priceType === "input" ? 6.999999 : (item.amountMinor ?? 0) / 100,
      fxRate: 7,
      fxRateObservedAt: "2026-07-31T00:00:00.000Z",
    }));

    const entries = apiRankingEntries([cny, usd], "input");
    expect(entries.map((entry) => entry.modelName)).toEqual(["USD", "CNY"]);
    expect(rankingCnyValue(entries[0].input)).toBe(6.999999);
    expect(rankingCnyValue(entries[1].input)).toBe(7);
  });

  it("excludes ineligible and unconvertible foreign tiers", () => {
    const item = provider("global", [["Latest", 0, 10, 100, 200]]);
    item.offers.push(
      offer("Latest", 0, "input", 25, {
        id: "latest-batch",
        currency: "USD",
        displayPrice: "$0.25",
        convertedCny: 1.75,
        rankingEligible: false,
        tierOrder: 10,
      }),
      offer("Foreign-only", 1, "input", 100, {
        currency: "USD",
        displayPrice: "$1",
      }),
    );
    const entries = apiRankingEntries([item], "input");
    expect(entries).toHaveLength(1);
    expect(entries[0].input?.id).not.toBe("latest-batch");
    expect(entries[0].modelName).toBe("Latest");
  });
});
