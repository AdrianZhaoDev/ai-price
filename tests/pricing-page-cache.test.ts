import {
  compressProviderCatalogForCache,
  decompressProviderCatalogFromCache,
} from "@/lib/pricing/page-cache";
import type { ProviderCatalogItem } from "@/lib/pricing/types";
import { describe, expect, it } from "vitest";

describe("pricing page cache payloads", () => {
  it("round-trips provider catalogs in a smaller cache payload", () => {
    const providers: ProviderCatalogItem[] = [
      {
        id: "large-api",
        name: "Large API",
        label: "Large API",
        description: "Official API prices",
        mode: "api",
        sourceUrl: "https://official.example/pricing",
        sourceLabel: "Official",
        sourceType: "official_api",
        color: "#000000",
        status: "verified",
        offers: Array.from({ length: 2_500 }, (_, index) => ({
          id: `model-${index}`,
          planId: `model-${index}`,
          planName: `Model ${index} · Input`,
          amountMinor: index,
          currency: "CNY",
          displayPrice: `¥${index}`,
          billingPeriod: "usage",
          status: "verified",
          observedAt: "2026-08-13T00:00:00.000Z",
          modelName: `Model ${index}`,
          priceType: "input",
        })),
      },
    ];

    const compressed = compressProviderCatalogForCache(providers);

    expect(Buffer.byteLength(compressed)).toBeLessThan(
      Buffer.byteLength(JSON.stringify(providers)),
    );
    expect(Buffer.byteLength(compressed)).toBeLessThan(2_000_000);
    expect(decompressProviderCatalogFromCache(compressed)).toEqual(providers);
  });
});
