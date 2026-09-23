import { describe, expect, it } from "vitest";
import { createCollectorRegistry } from "@/lib/collectors/registry";
import type { NormalizedOffer } from "@/lib/collectors/types";

function offer(
  priceType: NormalizedOffer["priceType"],
  rankingEligible = true,
  modelName = "Model",
): NormalizedOffer {
  const verifiedAmounts: Record<string, Partial<Record<string, number>>> = {
    "gpt-6-astra": { cached_input: 100, input: 1_000, output: 5_000 },
    "gpt-6-sol": { cached_input: 20, input: 200, output: 1_000 },
    "gpt-6-luna": { cached_input: 1, input: 10, output: 50 },
  };
  return {
    providerSlug: "global-api",
    productSlug: "global-api",
    canonicalPlanSlug: `${modelName}-${priceType}`,
    rawPlanName: `${modelName} · ${priceType}`,
    mode: "api",
    channel: "official_api",
    region: "全球",
    storefront: null,
    currency: "USD",
    amountMinor: verifiedAmounts[modelName]?.[priceType ?? ""] ?? 100,
    displayPrice: "$1",
    status: "verified",
    billingPeriod: "usage",
    unit: "/百万 tokens",
    taxIncluded: null,
    sourceUrl: "https://official.example/pricing",
    observedAt: "2026-07-31T00:00:00.000Z",
    parserVersion: "global-api-v3",
    modelName,
    modelSlug: modelName,
    priceType,
    rankingEligible,
  };
}

describe("global API adapter registry", () => {
  it("registers all four USD adapters with official sources", () => {
    const adapters = createCollectorRegistry().filter((adapter) =>
      [
        "openai-api-pricing-official",
        "claude-api-pricing-official",
        "gemini-api-pricing-official",
        "grok-api-pricing-official",
      ].includes(adapter.id),
    );
    expect(adapters.map((adapter) => adapter.providerSlug)).toEqual([
      "openai-api",
      "claude-api",
      "gemini-api",
      "grok-api",
    ]);
    expect(
      adapters.every(
        (adapter) =>
          adapter.sourceUrl.startsWith("https://") &&
          adapter.quoteCurrencies?.includes("USD") &&
          (adapter.parserVersion.endsWith("-v3") ||
            (adapter.id === "openai-api-pricing-official" &&
              adapter.parserVersion === "openai-api-v4") ||
            (adapter.id === "grok-api-pricing-official" &&
              adapter.parserVersion === "grok-api-v4")),
      ),
    ).toBe(true);
  });

  it("rejects excluded-only global API results", () => {
    const adapter = createCollectorRegistry().find(
      (item) => item.id === "openai-api-pricing-official",
    )!;
    const excluded = [
      offer("cached_input", false),
      offer("input", false),
      offer("output", false),
      offer("cached_input", false),
      offer("input", false),
      offer("output", false),
      offer("cached_input", false),
      offer("input", false),
      offer("output", false),
    ];

    expect(adapter.healthCheck(excluded)).toMatchObject({
      ok: false,
      code: "STRUCTURE_CHANGED",
    });
    const completeModels = ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"].flatMap(
      (modelName) => [
        offer("cached_input", true, modelName),
        offer("input", true, modelName),
        offer("output", true, modelName),
      ],
    );
    expect(adapter.healthCheck([...excluded, ...completeModels]).ok).toBe(true);
    expect(
      adapter.healthCheck([
        ...excluded,
        ...completeModels.filter((offer) => offer.modelName !== "gpt-6-luna"),
      ]),
    ).toMatchObject({ ok: false, code: "STRUCTURE_CHANGED" });
    expect(
      adapter.healthCheck(
        completeModels.map((candidate, index) =>
          index === 2 ? { ...candidate, amountMinor: 100 } : candidate,
        ),
      ),
    ).toMatchObject({ ok: false, code: "STRUCTURE_CHANGED" });
    expect(
      adapter.healthCheck([
        ...completeModels,
        { ...completeModels[6], rankingEligible: false, amountMinor: 0 },
      ]).ok,
    ).toBe(true);
  });
});
