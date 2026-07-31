import { describe, expect, it } from "vitest";
import { createCollectorRegistry } from "@/lib/collectors/registry";
import type { NormalizedOffer } from "@/lib/collectors/types";

function offer(
  priceType: NormalizedOffer["priceType"],
  rankingEligible = true,
): NormalizedOffer {
  return {
    providerSlug: "global-api",
    productSlug: "global-api",
    canonicalPlanSlug: `model-${priceType}`,
    rawPlanName: `Model · ${priceType}`,
    mode: "api",
    channel: "official_api",
    region: "全球",
    storefront: null,
    currency: "USD",
    amountMinor: 100,
    displayPrice: "$1",
    status: "verified",
    billingPeriod: "usage",
    unit: "/百万 tokens",
    taxIncluded: null,
    sourceUrl: "https://official.example/pricing",
    observedAt: "2026-07-31T00:00:00.000Z",
    parserVersion: "global-api-v3",
    modelName: "Model",
    modelSlug: "model",
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
          adapter.parserVersion.endsWith("-v3"),
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
    ];

    expect(adapter.healthCheck(excluded)).toMatchObject({
      ok: false,
      code: "STRUCTURE_CHANGED",
    });
    expect(
      adapter.healthCheck([
        ...excluded,
        offer("cached_input"),
        offer("input"),
        offer("output"),
      ]).ok,
    ).toBe(true);
  });
});
