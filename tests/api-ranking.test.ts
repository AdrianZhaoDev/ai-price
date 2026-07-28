import { describe, expect, it } from "vitest";
import { apiRankingEntries } from "@/lib/pricing/api-ranking";
import type { PriceOffer, ProviderCatalogItem } from "@/lib/pricing/types";

function offer(
  modelName: string,
  modelOrder: number,
  priceType: PriceOffer["priceType"],
  amountMinor: number,
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
      cachedInput: { amountMinor: 30 },
      input: { amountMinor: 100 },
      output: { amountMinor: 600 },
    });
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
});
