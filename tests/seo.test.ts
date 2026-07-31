import manifest from "@/app/manifest";
import robots from "@/app/robots";
import { buildSitemap, dynamic as sitemapRendering } from "@/app/sitemap";
import { providersForMode } from "@/lib/data/catalog";
import {
  landingPagePath,
  landingPages,
  metadataForLandingPage,
} from "@/lib/landing-pages";
import {
  absoluteUrl,
  metadataForDocument,
  metadataForMode,
  modeHref,
  SITE_ORIGIN,
} from "@/lib/seo";
import nextConfig, {
  privateRouteHeaders,
  securityHeaders,
} from "@/next.config";
import { describe, expect, it } from "vitest";

describe("SEO routes", () => {
  it("renders the sitemap dynamically from the authoritative runtime cache", () => {
    expect(sitemapRendering).toBe("force-dynamic");
  });

  it("assigns a stable, distinct URL to every pricing mode", () => {
    expect(modeHref("global")).toBe("/");
    expect(modeHref("china-subscription")).toBe("/china-ai-subscriptions");
    expect(modeHref("api")).toBe("/api-pricing");
  });

  it("builds canonical metadata for each pricing mode", () => {
    expect(metadataForMode("global").alternates?.canonical).toBe("/");
    expect(metadataForMode("china-subscription").alternates?.canonical).toBe(
      "/china-ai-subscriptions",
    );
    expect(metadataForMode("api").alternates?.canonical).toBe("/api-pricing");
    expect(metadataForMode("global").description?.length).toBeGreaterThan(70);
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
  });

  it("publishes public pages in the sitemap without duplicate URLs", () => {
    const urls = buildSitemap({
      global: providersForMode("global"),
      "china-subscription": providersForMode("china-subscription"),
      api: providersForMode("api"),
    }).map((entry) => entry.url);

    expect(urls.slice(0, 5)).toEqual([
      absoluteUrl("/"),
      absoluteUrl("/china-ai-subscriptions"),
      absoluteUrl("/api-pricing"),
      absoluteUrl("/methodology"),
      absoluteUrl("/privacy"),
    ]);
    expect(
      urls
        .slice(5)
        .every((url) =>
          landingPages.some(
            (page) => absoluteUrl(landingPagePath(page)) === url,
          ),
        ),
    ).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("defines stable metadata for every SEO landing page", () => {
    expect(landingPages).toHaveLength(31);
    expect(new Set(landingPages.map((page) => page.slug)).size).toBe(31);
    for (const page of landingPages) {
      const metadata = metadataForLandingPage(page);
      expect(metadata.title).toEqual({ absolute: page.title });
      expect(metadata.alternates?.canonical).toBe(`/${page.slug}`);
      expect(metadata.description).toContain(page.name);
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
      disallow: ["/admin", "/api/", "/pricing-data/", "/subscription/"],
    });
    expect(
      result.rules && !Array.isArray(result.rules) && result.rules.disallow,
    ).toContain("/pricing-data/");
    expect(
      result.rules &&
        !Array.isArray(result.rules) &&
        result.rules.disallow?.includes("/api-pricing"),
    ).toBe(false);
  });

  it("exposes an installable site manifest", () => {
    const result = manifest();

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
      ]),
    );
  });
});
