import { describe, expect, it } from "vitest";
import { modes, providerCatalog, providersForMode } from "@/lib/data/catalog";
import { readFileSync } from "node:fs";
import { parseHuaweiMaaSApi } from "@/lib/collectors/adapters/api-pricing/rules";
import { hashContent } from "@/lib/collectors/http-client";

describe("catalog contract", () => {
  it("contains the requested modes and all integrated official providers", () => {
    expect(modes.map((mode) => mode.id)).toEqual([
      "global",
      "china-subscription",
      "api",
    ]);
    expect(providersForMode("global").map((item) => item.id)).toEqual([
      "chatgpt",
      "claude",
      "gemini",
      "grok",
    ]);
    expect(providersForMode("china-subscription")[0].id).toBe(
      "glm-resource-package",
    );
    expect(providersForMode("china-subscription")).toHaveLength(15);
    expect(
      providersForMode("china-subscription").map((item) => item.id),
    ).toEqual(
      expect.arrayContaining([
        "glm-coding-plan",
        "comate-subscription",
        "qoder-subscription",
        "trae-subscription",
        "codebuddy-subscription",
        "mimo-token-plan",
        "huawei-token-plan",
        "sensenova-token-plan",
      ]),
    );
    expect(providersForMode("api")).toHaveLength(20);
    expect(providersForMode("api").map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "mimo-api",
        "baichuan-api",
        "longcat-api",
        "siliconflow-api",
        "huawei-maas-api",
        "teleai-api",
        "openai-api",
        "claude-api",
        "gemini-api",
        "grok-api",
      ]),
    );
    expect(
      providersForMode("api")
        .slice(16)
        .map((item) => item.id),
    ).toEqual(["openai-api", "claude-api", "gemini-api", "grok-api"]);
  });

  it("keeps every record traceable to an official HTTPS source", () => {
    for (const provider of providerCatalog) {
      expect(provider.sourceUrl).toMatch(/^https:\/\//);
      expect(provider.offers.length).toBeGreaterThan(0);
      for (const offer of provider.offers) {
        expect(offer.planId).toBeTruthy();
        expect(offer.displayPrice).toBeTruthy();
      }
    }
  });

  it("keeps the Grok fallback catalog on the current mainline allowlist", () => {
    const grok = providerCatalog.find((provider) => provider.id === "grok-api");
    expect(grok).toBeDefined();
    expect(new Set(grok?.offers.map((offer) => offer.modelSlug))).toEqual(
      new Set(["grok-4-6", "grok-4-5", "grok-4-3"]),
    );
  });

  it("keeps the TRAE fallback offers comparable with a dated FX snapshot", () => {
    const trae = providerCatalog.find(
      (provider) => provider.id === "trae-subscription",
    );
    expect(trae?.offers.map((offer) => offer.amountMinor)).toEqual([
      0, 2000, 6000, 20000,
    ]);
    expect(trae?.lastCheckedAt).toBe("2026-09-17T05:33:29Z");
    for (const offer of trae?.offers ?? []) {
      expect(offer.convertedCny).toBeTypeOf("number");
      expect(offer.fxRate).toBeGreaterThan(0);
      expect(offer.fxRateObservedAt).toBeTruthy();
    }
  });

  it("keeps Huawei's fallback identities and amounts on its current public pricing table", () => {
    const huawei = providerCatalog.find(
      (provider) => provider.id === "huawei-maas-api",
    )!;
    const body = readFileSync(
      "tests/fixtures/huawei-maas-2026-10-14.html",
      "utf8",
    );
    const current = parseHuaweiMaaSApi({
      body,
      status: 200,
      headers: {},
      sourceUrl: huawei.sourceUrl,
      contentHash: hashContent(body),
      observedAt: "2026-10-14T03:03:00Z",
    });
    expect(huawei.lastCheckedAt).toBe("2026-10-14T11:03:00+08:00");
    for (const offer of huawei.offers) {
      expect(offer.modelName).toBe("DeepSeek-V4.1-Flash");
      expect(
        current.find((row) => row.canonicalPlanSlug === offer.planId),
      ).toMatchObject({
        amountMinor: offer.amountMinor,
        currency: offer.currency,
        unit: offer.unit,
        modelName: offer.modelName,
        priceType: offer.priceType,
        priceTier: offer.priceTier,
      });
    }
  });

  it("dates the Kimi fallback FX separately from its newly verified monthly prices", () => {
    const kimi = providerCatalog.find(
      (provider) => provider.id === "kimi-membership",
    )!;
    expect(kimi.offers.map((offer) => offer.planName)).toEqual([
      "Plus",
      "Pro",
      "Max",
      "Ultra",
    ]);
    expect(kimi.offers.map((offer) => offer.convertedCny)).toEqual([
      127.064803, 260.817227, 662.0745, 1330.836621,
    ]);
    for (const offer of kimi.offers) {
      expect(offer.fxRate).toBe(6.6876212131);
      expect(offer.fxRateObservedAt).toBe("2026-10-14T00:00:00Z");
    }
  });
});
