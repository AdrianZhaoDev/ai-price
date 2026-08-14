import { chineseManifest } from "@/lib/site-manifests";
import robots from "@/app/robots";
import {
  buildSitemap,
  renderSitemapIndexXml,
  SITEMAP_CACHE_REVALIDATE_SECONDS,
  sitemapPageCount,
} from "@/lib/catalog-sitemap";
import { providersForMode } from "@/lib/data/catalog";
import {
  landingPagePath,
  landingPages,
  metadataForLandingPage,
} from "@/lib/landing-pages";
import {
  metadataForModel,
  modelSeoDescription,
  modelSeoTitle,
} from "@/lib/model-catalog/seo";
import {
  modelReleaseWatchMetadata,
  modelReleaseWatchPath,
} from "@/lib/model-release-watch";
import type {
  ModelCatalogSummary,
  ModelDetail,
} from "@/lib/model-catalog/types";
import {
  absoluteUrl,
  metadataForDocument,
  metadataForMode,
  modeHref,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_DESCRIPTION_MIN_LENGTH,
  SITE_ORIGIN,
} from "@/lib/seo";
import nextConfig, {
  privateRouteHeaders,
  securityHeaders,
} from "@/next.config";
import { describe, expect, it } from "vitest";

describe("SEO routes", () => {
  it("renders the sitemap dynamically from the authoritative runtime cache", () => {
    expect(SITEMAP_CACHE_REVALIDATE_SECONDS).toBe(60 * 60);
    expect(sitemapPageCount(45_000)).toBe(1);
    expect(sitemapPageCount(45_001)).toBe(2);
    expect(
      renderSitemapIndexXml(2, new Date("2026-08-10T00:00:00.000Z")),
    ).toContain("/sitemaps/2.xml");
  });

  it("assigns a stable, distinct URL to every pricing mode", () => {
    expect(modeHref("global")).toBe("/");
    expect(modeHref("china-subscription")).toBe("/china-ai-subscriptions");
    expect(modeHref("api")).toBe("/api-pricing");
  });

  it("builds canonical metadata for each pricing mode", () => {
    expect(absoluteUrl("/")).toBe(SITE_ORIGIN);
    expect(metadataForMode("global").alternates?.canonical).toBe(SITE_ORIGIN);
    expect(metadataForMode("china-subscription").alternates?.canonical).toBe(
      "/china-ai-subscriptions",
    );
    expect(metadataForMode("api").alternates?.canonical).toBe("/api-pricing");
    expect(metadataForMode("api").title).toEqual({
      absolute: "AI 模型 API 价格与规格排行榜",
    });
    expect(metadataForMode("api").description).toContain("API 价格与规格");
    for (const locale of ["zh-CN", "en"] as const) {
      for (const mode of ["global", "china-subscription", "api"] as const) {
        const metadata = metadataForMode(mode, locale);
        const title = (metadata.title as { absolute: string }).absolute;
        const description = metadata.description ?? "";
        expect(title.length).toBeLessThanOrEqual(60);
        expect(description.length).toBeGreaterThanOrEqual(
          SEO_DESCRIPTION_MIN_LENGTH,
        );
        expect(description.length).toBeLessThanOrEqual(
          SEO_DESCRIPTION_MAX_LENGTH,
        );
      }
    }
  });

  it("publishes bilingual metadata for the release watch page", () => {
    const metadata = modelReleaseWatchMetadata("zh-CN");
    expect(metadata.title).toEqual({
      absolute: "DeepSeek V4 Pro-0813 与 Grok 4.6 API 价格对比",
    });
    expect(metadata.description).toContain("Grok 4.6");
    expect(metadata.alternates?.canonical).toBe(modelReleaseWatchPath());
    expect(metadata.alternates?.languages).toMatchObject({
      "zh-CN": "/ai-model-release-watch",
      en: "/en/ai-model-release-watch",
    });

    const english = modelReleaseWatchMetadata("en");
    expect(english.title).toEqual({
      absolute: "DeepSeek V4 Pro-0813 vs Grok 4.6 API Prices",
    });
    expect(english.alternates?.canonical).toBe("/en/ai-model-release-watch");
    for (const localized of [metadata, english]) {
      expect(localized.description?.length).toBeGreaterThanOrEqual(
        SEO_DESCRIPTION_MIN_LENGTH,
      );
      expect(localized.description?.length).toBeLessThanOrEqual(
        SEO_DESCRIPTION_MAX_LENGTH,
      );
    }
  });

  it("disambiguates SEO metadata for models with the same display name", () => {
    const standard = {
      id: "google/gemini-3.1-flash-image",
      name: "Nano Banana 2",
      description:
        "Image model for prompt-driven generation, editing, and visual design workflows",
    };
    const preview = {
      ...standard,
      id: "google/gemini-3.1-flash-image-preview",
    };

    expect(modelSeoTitle(standard)).not.toBe(modelSeoTitle(preview));
    expect(modelSeoDescription(standard)).not.toBe(
      modelSeoDescription(preview),
    );
    expect(modelSeoDescription(preview)).toContain(
      "模型 ID：google/gemini-3.1-flash-image-preview",
    );
    for (const locale of ["zh-CN", "en"] as const) {
      expect(modelSeoTitle(standard, locale).length).toBeLessThanOrEqual(60);
      expect(modelSeoTitle(preview, locale).length).toBeLessThanOrEqual(60);
      expect(
        modelSeoDescription(preview, locale).length,
      ).toBeGreaterThanOrEqual(SEO_DESCRIPTION_MIN_LENGTH);
      expect(modelSeoDescription(preview, locale).length).toBeLessThanOrEqual(
        155,
      );
    }
  });

  it("marks unserved model details noindex while keeping links followable", () => {
    const model = {
      id: "lab/unserved",
      name: "Unserved",
      labId: "lab",
      labName: "Lab",
      inputModalities: ["text"],
      outputModalities: ["text"],
      releaseDate: "2026-01-01",
      updatedDate: "2026-08-11",
      providerCount: 0,
      providerIds: [],
      providerNames: [],
      active: true,
      origin: "models.dev",
      openWeights: false,
      capabilities: {},
      providers: [],
      catalogVersion: "a".repeat(40),
      sourceUrl: "https://example.com/model.toml",
    } satisfies ModelDetail;

    expect(metadataForModel(model).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("builds complete social metadata for document pages", () => {
    const metadata = metadataForDocument({
      path: "/methodology",
      title: "价格采集方法",
      description: "一段足够清楚的页面说明",
    });

    expect(metadata.alternates?.canonical).toBe("/methodology");
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      url: "/methodology",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
    });
    expect(metadata.description?.length).toBeGreaterThanOrEqual(
      SEO_DESCRIPTION_MIN_LENGTH,
    );
    expect(metadata.description?.length).toBeLessThanOrEqual(
      SEO_DESCRIPTION_MAX_LENGTH,
    );
  });

  it("publishes public pages in the sitemap without duplicate URLs", () => {
    const urls = buildSitemap(
      {
        global: providersForMode("global"),
        "china-subscription": providersForMode("china-subscription"),
        api: providersForMode("api"),
      },
      new Date("2026-07-24T00:00:00.000Z"),
    ).map((entry) => entry.url);

    expect(urls.slice(0, 5)).toEqual([
      absoluteUrl("/"),
      absoluteUrl("/china-ai-subscriptions"),
      absoluteUrl("/api-pricing"),
      absoluteUrl("/methodology"),
      absoluteUrl("/privacy"),
    ]);
    expect(urls.slice(0, 10)).toEqual([
      absoluteUrl("/"),
      absoluteUrl("/china-ai-subscriptions"),
      absoluteUrl("/api-pricing"),
      absoluteUrl("/methodology"),
      absoluteUrl("/privacy"),
      absoluteUrl("/ai-model-release-watch"),
      absoluteUrl("/en"),
      absoluteUrl("/en/china-ai-subscriptions"),
      absoluteUrl("/en/api-pricing"),
      absoluteUrl("/en/methodology"),
    ]);
    expect(urls.slice(10, 12)).toEqual([
      absoluteUrl("/en/privacy"),
      absoluteUrl("/en/ai-model-release-watch"),
    ]);
    expect(
      urls
        .slice(12)
        .every((url) =>
          landingPages.some(
            (page) =>
              absoluteUrl(landingPagePath(page)) === url ||
              absoluteUrl(landingPagePath(page, "en")) === url,
          ),
        ),
    ).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("advances model lastmod when the page template changes", () => {
    const model = {
      id: "lab/legacy-model",
      name: "Legacy Model",
      labId: "lab",
      labName: "Lab",
      description: "A served model with useful pricing and specification data.",
      inputModalities: ["text"],
      releaseDate: "2025-01-01",
      updatedDate: "2026-07-01",
      providerCount: 1,
      providerIds: ["provider"],
      providerNames: ["Provider"],
      active: true,
      origin: "models.dev",
    } satisfies ModelCatalogSummary;
    const entries = buildSitemap(
      {
        global: providersForMode("global"),
        "china-subscription": providersForMode("china-subscription"),
        api: providersForMode("api"),
      },
      new Date("2026-08-11T12:00:00.000Z"),
      [model],
    );

    for (const path of [
      "/models/lab/legacy-model",
      "/en/models/lab/legacy-model",
    ]) {
      expect(
        entries.find((entry) => entry.url === absoluteUrl(path))?.lastModified,
      ).toEqual(new Date("2026-08-11T00:00:00.000Z"));
    }
  });

  it("defines stable metadata for every SEO landing page", () => {
    expect(landingPages).toHaveLength(31);
    expect(new Set(landingPages.map((page) => page.slug)).size).toBe(31);
    for (const page of landingPages) {
      const metadata = metadataForLandingPage(page);
      expect(metadata.alternates?.canonical).toBe(`/${page.slug}`);
      expect(metadata.description).toContain(page.name);
      for (const locale of ["zh-CN", "en"] as const) {
        const localized = metadataForLandingPage(page, true, locale);
        const title = (localized.title as { absolute: string }).absolute;
        const description = localized.description ?? "";
        expect(title.length).toBeLessThanOrEqual(60);
        expect(description.length).toBeGreaterThanOrEqual(
          SEO_DESCRIPTION_MIN_LENGTH,
        );
        expect(description.length).toBeLessThanOrEqual(
          SEO_DESCRIPTION_MAX_LENGTH,
        );
      }
    }
    expect(
      metadataForLandingPage(landingPages[0]!, false).robots,
    ).toMatchObject({
      index: false,
      follow: true,
    });
  });

  it("keeps private application routes out of search results", () => {
    const result = robots();

    expect(result.sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`);
    expect(result.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/pricing-data/",
        "/subscription/",
        "/en/subscription/",
      ],
    });
    expect(
      result.rules && !Array.isArray(result.rules) && result.rules.disallow,
    ).toContain("/pricing-data/");
    expect(
      result.rules && !Array.isArray(result.rules) && result.rules.disallow,
    ).toContain("/en/subscription/");
    expect(
      result.rules &&
        !Array.isArray(result.rules) &&
        result.rules.disallow?.includes("/api-pricing"),
    ).toBe(false);
  });

  it("exposes an installable site manifest", () => {
    const result = chineseManifest;

    expect(result.start_url).toBe("/");
    expect(result.name).toContain("Low Price Radar");
    expect(result.icons).toContainEqual(
      expect.objectContaining({ src: "/icon.svg", type: "image/svg+xml" }),
    );
  });

  it("publishes security headers and keeps private routes out of caches", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/:path*",
          headers: securityHeaders,
        }),
        expect.objectContaining({
          source: "/admin/:path*",
          headers: privateRouteHeaders,
        }),
        expect.objectContaining({
          source: "/api/:path*",
          headers: privateRouteHeaders,
        }),
        expect.objectContaining({
          source: "/subscription/:path*",
          headers: privateRouteHeaders,
        }),
        expect.objectContaining({
          source: "/en/subscription/:path*",
          headers: privateRouteHeaders,
        }),
      ]),
    );
  });
});
