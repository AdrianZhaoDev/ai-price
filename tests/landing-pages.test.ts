import {
  apiModelsForLandingPage,
  buildLandingPageData,
  offersForLandingPage,
  type LandingCatalogSnapshot,
} from "@/lib/landing-page-data";
import {
  childLandingPages,
  landingPageBySlug,
  landingPages,
  landingPagesForMode,
  relatedLandingPages,
} from "@/lib/landing-pages";
import { absoluteUrl } from "@/lib/seo";
import type { ProviderCatalogItem } from "@/lib/pricing/types";
import { describe, expect, it } from "vitest";

function provider(
  id: string,
  mode: ProviderCatalogItem["mode"],
  offers: ProviderCatalogItem["offers"],
): ProviderCatalogItem {
  return {
    id,
    name: id,
    label: id,
    description: "official",
    mode,
    sourceUrl: "https://example.com/pricing",
    sourceLabel: "官方页面",
    sourceType: mode === "api" ? "official_api" : "official_web",
    color: "#00c968",
    status: "verified",
    lastCheckedAt: "2026-07-31T08:00:00.000Z",
    offers,
  };
}

function snapshot(providers: ProviderCatalogItem[]): LandingCatalogSnapshot {
  return {
    global: providers.filter((item) => item.mode === "global"),
    "china-subscription": providers.filter(
      (item) => item.mode === "china-subscription",
    ),
    api: providers.filter((item) => item.mode === "api"),
  };
}

function globalOffer(
  id: string,
  planId: string,
  billingPeriod: "month" | "year",
  regionCode: string,
  convertedCny: number,
): ProviderCatalogItem["offers"][number] {
  return {
    id,
    planId,
    planName: planId,
    amountMinor: Math.round(convertedCny * 100),
    currency: "CNY",
    displayPrice: `¥${convertedCny}`,
    convertedCny,
    billingPeriod,
    regionCode,
    regionName: regionCode,
    observedAt: "2026-07-30T08:00:00.000Z",
    status: "verified",
  };
}

describe("SEO landing page registry", () => {
  it("contains the global and domestic page matrix", () => {
    expect(landingPages).toHaveLength(31);
    expect(landingPageBySlug.get("glm-price")?.providerIds).toEqual({
      "china-subscription": ["glm-resource-package", "glm-coding-plan"],
      api: ["glm-api"],
    });
    expect(landingPageBySlug.get("grok-price")?.planIds).toBeUndefined();
    expect(landingPageBySlug.get("chatgpt-plus-price")?.planIds).not.toContain(
      "chatgpt-plus-annual",
    );
  });

  it("defines crawlable product, child, sibling and domestic brand indexes", () => {
    const chatgpt = landingPageBySlug.get("chatgpt-price")!;
    const plus = landingPageBySlug.get("chatgpt-plus-price")!;

    expect(childLandingPages(chatgpt).map((page) => page.slug)).toEqual([
      "chatgpt-plus-price",
      "chatgpt-go-price",
      "chatgpt-pro-price",
    ]);
    expect(relatedLandingPages(plus).map((page) => page.slug)).toEqual([
      "chatgpt-price",
      "chatgpt-go-price",
      "chatgpt-pro-price",
    ]);
    expect(landingPagesForMode("global")).toHaveLength(4);
    expect(landingPagesForMode("china-subscription")).toHaveLength(14);
    expect(landingPagesForMode("api")).toHaveLength(16);
  });

  it("filters global plan families without changing provider data", () => {
    const page = landingPageBySlug.get("chatgpt-plus-price");
    const offers = [
      {
        id: "plus",
        planId: "chatgpt-plus-monthly",
        planName: "ChatGPT Plus",
        amountMinor: 2000,
        currency: "USD",
        displayPrice: "$20",
        billingPeriod: "month" as const,
        status: "verified" as const,
      },
      {
        id: "pro",
        planId: "chatgpt-pro-20x-monthly",
        planName: "ChatGPT Pro 20x",
        amountMinor: 20000,
        currency: "USD",
        displayPrice: "$200",
        billingPeriod: "month" as const,
        status: "verified" as const,
      },
    ];
    const chatgpt = provider("chatgpt", "global", offers);

    expect(page).toBeDefined();
    expect(
      offersForLandingPage(page!, chatgpt).map((offer) => offer.planId),
    ).toEqual(["chatgpt-plus-monthly"]);
    expect(chatgpt.offers).toHaveLength(2);
  });

  it("only creates model deep links for stable model slugs", () => {
    const api = provider("deepseek-api", "api", [
      {
        id: "stable-input",
        planId: "deepseek-v4-input",
        planName: "DeepSeek V4 · 输入",
        amountMinor: 100,
        currency: "CNY",
        displayPrice: "¥1",
        billingPeriod: "usage",
        unit: "/百万 tokens",
        modelName: "DeepSeek V4",
        modelSlug: "deepseek-v4",
        priceType: "input",
        status: "verified",
      },
      {
        id: "fallback-input",
        planId: "legacy-model-input",
        planName: "Legacy Model · 输入",
        amountMinor: 100,
        currency: "CNY",
        displayPrice: "¥1",
        billingPeriod: "usage",
        unit: "/百万 tokens",
        status: "verified",
      },
    ]);

    expect(apiModelsForLandingPage([api])).toMatchObject([
      { providerId: "deepseek-api", slug: "deepseek-v4", name: "DeepSeek V4" },
    ]);
  });

  it("keeps subscription variants and billing periods in separate comparable groups", () => {
    const page = landingPageBySlug.get("claude-max-price")!;
    const claude = provider("claude", "global", [
      globalOffer("max-us", "claude-max-monthly", "month", "US", 100),
      globalOffer("max-jp", "claude-max-monthly", "month", "JP", 110),
      globalOffer("max-in", "claude-max-monthly", "month", "IN", 90),
      globalOffer("5x-us", "claude-max-5x-monthly", "month", "US", 200),
      globalOffer("20x-us", "claude-max-20x-monthly", "month", "US", 400),
    ]);
    const data = buildLandingPageData(
      page,
      snapshot([claude]),
      new Date("2026-07-31T10:00:00.000Z"),
    );

    expect(data.summary.subscriptionGroups).toHaveLength(3);
    expect(
      data.summary.subscriptionGroups.find(
        (group) => group.label === "claude-max-monthly",
      ),
    ).toMatchObject({
      regionCount: 3,
      spreadCny: 20,
      minimum: { regionCode: "IN" },
      maximum: { regionCode: "JP" },
    });
    expect(data.quality.indexable).toBe(true);
  });

  it("requires three regions for global indexing", () => {
    const page = landingPageBySlug.get("chatgpt-plus-price")!;
    const twoRegions = provider("chatgpt", "global", [
      globalOffer("plus-us", "chatgpt-plus-monthly", "month", "US", 145),
      globalOffer("plus-jp", "chatgpt-plus-monthly", "month", "JP", 132),
    ]);
    const threeRegions = {
      ...twoRegions,
      offers: [
        ...twoRegions.offers,
        globalOffer("plus-in", "chatgpt-plus-monthly", "month", "IN", 120),
      ],
    };
    const now = new Date("2026-07-31T10:00:00.000Z");

    expect(
      buildLandingPageData(page, snapshot([twoRegions]), now).quality,
    ).toMatchObject({
      indexable: false,
      reason: "insufficient_global_regions",
    });
    expect(
      buildLandingPageData(page, snapshot([threeRegions]), now).quality,
    ).toMatchObject({ indexable: true, reason: "indexable" });
  });

  it("indexes a real domestic subscription offer and expires it after seven days", () => {
    const page = landingPageBySlug.get("trae-price")!;
    const trae = provider("trae-subscription", "china-subscription", [
      {
        id: "trae-pro",
        planId: "trae-pro-monthly",
        planName: "TRAE Pro",
        amountMinor: 9900,
        currency: "CNY",
        displayPrice: "¥99",
        billingPeriod: "month",
        observedAt: "2026-07-20T08:00:00.000Z",
        status: "verified",
      },
    ]);

    expect(
      buildLandingPageData(
        page,
        snapshot([trae]),
        new Date("2026-07-31T10:00:00.000Z"),
      ).quality.indexable,
    ).toBe(true);
    expect(
      buildLandingPageData(
        page,
        snapshot([{ ...trae, lastCheckedAt: "2026-07-20T08:00:00.000Z" }]),
        new Date("2026-07-31T10:00:00.000Z"),
      ).quality,
    ).toMatchObject({ indexable: false, reason: "expired" });
  });

  it("requires stable API models while keeping non-token units out of token highlights", () => {
    const page = landingPageBySlug.get("teleai-price")!;
    const teleai = provider("teleai-api", "api", [
      {
        id: "telemm-qps",
        planId: "telemm-qps",
        planName: "TeleMM · QPS",
        amountMinor: 10000,
        currency: "CNY",
        displayPrice: "¥100",
        billingPeriod: "usage",
        unit: "/月/QPS",
        modelName: "TeleMM",
        modelSlug: "telemm",
        priceType: "other",
        observedAt: "2026-07-30T08:00:00.000Z",
        status: "verified",
      },
    ]);
    const data = buildLandingPageData(
      page,
      snapshot([teleai]),
      new Date("2026-07-31T10:00:00.000Z"),
    );

    expect(data.quality.indexable).toBe(true);
    expect(data.summary.apiGroups).toHaveLength(1);
    expect(data.summary.tokenHighlights).toEqual([]);

    const unstable = {
      ...teleai,
      offers: teleai.offers.map((offer) => ({
        ...offer,
        modelSlug: undefined,
      })),
    };
    expect(
      buildLandingPageData(
        page,
        snapshot([unstable]),
        new Date("2026-07-31T10:00:00.000Z"),
      ).quality,
    ).toMatchObject({ indexable: false, reason: "no_stable_api_model" });
  });

  it("separates API metrics, tiers and units and reports deterministic page times", () => {
    const page = landingPageBySlug.get("deepseek-price")!;
    const deepseek = provider("deepseek-api", "api", [
      ...(["input", "output"] as const).flatMap((priceType, index) => [
        {
          id: `${priceType}-standard`,
          planId: `${priceType}-standard`,
          planName: `DeepSeek V4 · ${priceType}`,
          amountMinor: 100 + index,
          currency: "CNY",
          displayPrice: `¥${1 + index}`,
          billingPeriod: "usage" as const,
          unit: "/百万 tokens",
          modelName: "DeepSeek V4",
          modelSlug: "deepseek-v4",
          priceType,
          priceTier: "standard",
          observedAt: "2026-08-01T08:00:00.000Z",
          status: "verified" as const,
        },
        {
          id: `${priceType}-long`,
          planId: `${priceType}-long`,
          planName: `DeepSeek V4 · ${priceType} · long`,
          amountMinor: 200 + index,
          currency: "CNY",
          displayPrice: `¥${2 + index}`,
          billingPeriod: "usage" as const,
          unit: "/百万 tokens",
          modelName: "DeepSeek V4",
          modelSlug: "deepseek-v4",
          priceType,
          priceTier: "long-context",
          observedAt: "2026-08-01T08:00:00.000Z",
          status: "verified" as const,
        },
      ]),
    ]);
    const data = buildLandingPageData(
      page,
      snapshot([deepseek]),
      new Date("2026-07-31T10:00:00.000Z"),
    );

    expect(data.summary.apiGroups).toHaveLength(4);
    expect(data.summary.tokenHighlights.map((item) => item.priceType)).toEqual([
      "input",
      "output",
    ]);
    expect(data.quality.lastCheckedAt).toBe("2026-07-31T08:00:00.000Z");
    expect(data.quality.priceModifiedAt).toBe("2026-08-01T08:00:00.000Z");
    expect(data.quality.pageModifiedAt).toBe("2026-08-01T08:00:00.000Z");
  });

  it("publishes only quality-approved landing pages with stable lastmod values", () => {
    const chatgpt = provider("chatgpt", "global", [
      globalOffer("plus-us", "chatgpt-plus-monthly", "month", "US", 145),
      globalOffer("plus-jp", "chatgpt-plus-monthly", "month", "JP", 132),
      globalOffer("plus-in", "chatgpt-plus-monthly", "month", "IN", 120),
    ]);
    const trae = provider("trae-subscription", "china-subscription", [
      {
        id: "trae-pro",
        planId: "trae-pro-monthly",
        planName: "TRAE Pro",
        amountMinor: 9900,
        currency: "CNY",
        displayPrice: "¥99",
        billingPeriod: "month",
        observedAt: "2026-08-01T08:00:00.000Z",
        status: "verified",
      },
    ]);
    const entries = buildSitemap(snapshot([chatgpt, trae]));
    const landingEntries = entries.slice(5);

    expect(landingEntries.map((entry) => entry.url)).toEqual([
      absoluteUrl("/chatgpt-price"),
      absoluteUrl("/chatgpt-plus-price"),
      absoluteUrl("/trae-price"),
    ]);
    expect(
      landingEntries.find((entry) => entry.url === absoluteUrl("/trae-price"))
        ?.lastModified,
    ).toEqual(new Date("2026-08-01T08:00:00.000Z"));
    expect(entries.some((entry) => entry.url.includes("?"))).toBe(false);
    expect(entries.every((entry) => entry.changeFrequency === undefined)).toBe(
      true,
    );
  });
});
import { buildSitemap } from "@/app/sitemap";
