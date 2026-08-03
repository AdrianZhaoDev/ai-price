import { providerCatalog } from "@/lib/data/catalog";
import { prepareProvidersForClient } from "@/lib/pricing/client-catalog";
import {
  latestProviderCheckAt,
  loadProviderCatalog,
} from "@/lib/pricing/repository";
import type { ProviderCatalogItem } from "@/lib/pricing/types";
import { describe, expect, it } from "vitest";

describe("pricing page payload", () => {
  it("uses the latest successful sighting for the freshness label", () => {
    expect(
      latestProviderCheckAt(
        "2026-07-28T03:16:43.199Z",
        new Date("2026-07-31T04:00:47.289Z"),
      ),
    ).toBe("2026-07-31T04:00:47.289Z");
    expect(
      latestProviderCheckAt(
        "2026-07-31T04:00:47.289Z",
        new Date("2026-07-28T03:16:43.199Z"),
      ),
    ).toBe("2026-07-31T04:00:47.289Z");
  });

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

  it.each(["global", "china-subscription"] as const)(
    "keeps only the preferred %s provider complete",
    (mode) => {
      const providers = providerCatalog
        .filter((provider) => provider.mode === mode)
        .map((provider) => ({
          ...provider,
          offers: provider.offers.map((offer) => ({ ...offer })),
        }));
      const preferred = providers.at(-1);
      expect(preferred).toBeDefined();

      const result = prepareProvidersForClient(providers, mode, preferred!.id);
      const completePreferred = result.providers.find(
        (provider) => provider.id === preferred!.id,
      );

      expect(completePreferred?.offers).toEqual(preferred!.offers);
      for (const provider of result.providers) {
        if (provider.id === preferred!.id) continue;
        expect(provider.offers.length).toBeLessThanOrEqual(1);
        if (
          provider.offers.length <
          providers.find((item) => item.id === provider.id)!.offers.length
        ) {
          expect(result.deferredProviderIds).toContain(provider.id);
        }
      }
    },
  );

  it("falls back to the first displayable provider for an invalid preference", () => {
    const providers = providerCatalog.filter(
      (provider) => provider.mode === "global",
    );
    const first = providers.find((provider) => provider.offers.length > 0);
    const result = prepareProvidersForClient(
      providers,
      "global",
      "not-a-provider",
    );

    expect(
      result.providers.find((provider) => provider.id === first?.id)?.offers,
    ).toEqual(first?.offers);
  });
});
