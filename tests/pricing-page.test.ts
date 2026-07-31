import { providerCatalog } from "@/lib/data/catalog";
import { prepareProvidersForClient } from "@/lib/pricing/client-catalog";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import type { ProviderCatalogItem } from "@/lib/pricing/types";
import { describe, expect, it } from "vitest";

describe("pricing page payload", () => {
  it("loads only the requested pricing mode", async () => {
    const providers = await loadProviderCatalog("china-subscription");

    expect(providers.length).toBeGreaterThan(0);
    expect(
      providers.every((provider) => provider.mode === "china-subscription"),
    ).toBe(true);
  });

  it("loads only the requested provider when a provider is supplied", async () => {
    const providers = await loadProviderCatalog("api", "deepseek-api");

    expect(providers).toHaveLength(1);
    expect(providers[0]?.id).toBe("deepseek-api");
  });

  it("defers oversized API provider details while retaining ranking data", () => {
    const providers = providerCatalog
      .filter((provider) => provider.mode === "api")
      .map((provider) => ({
        ...provider,
        offers: provider.offers.map((offer) => ({ ...offer })),
      }));
    const qwen = providers.find((provider) => provider.id === "qwen-api");
    const template = providers
      .find((provider) => provider.id === "deepseek-api")
      ?.offers.find((offer) => offer.amountMinor !== null);
    expect(qwen).toBeDefined();
    expect(template).toBeDefined();

    qwen!.offers = Array.from({ length: 80 }, (_, index) => ({
      ...template!,
      id: `qwen-offer-${index}`,
      planId: `qwen-plan-${index}`,
      planName: `Qwen Model ${index} · 输入`,
      modelName: `Qwen Model ${index}`,
      modelSlug: `qwen-model-${index}`,
      modelOrder: index,
      priceType: "input" as const,
    }));

    const result = prepareProvidersForClient(
      providers as ProviderCatalogItem[],
      "api",
    );
    const compactQwen = result.providers.find(
      (provider) => provider.id === "qwen-api",
    );
    const primary = result.providers.find(
      (provider) => provider.id === "deepseek-api",
    );
    const originalPrimary = providers.find(
      (provider) => provider.id === "deepseek-api",
    );

    expect(result.deferredProviderIds).toContain("qwen-api");
    expect(compactQwen?.offers.length).toBeLessThan(qwen!.offers.length);
    expect(compactQwen?.offers.length).toBeGreaterThan(0);
    expect(primary?.offers).toEqual(originalPrimary?.offers);
  });
});
