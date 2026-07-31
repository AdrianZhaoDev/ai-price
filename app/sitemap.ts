import type { MetadataRoute } from "next";
import {
  buildLandingPageData,
  loadCachedLandingCatalogSnapshot,
  type LandingCatalogSnapshot,
} from "@/lib/landing-page-data";
import { landingPages, landingPagePath } from "@/lib/landing-pages";
import { absoluteUrl } from "@/lib/seo";

const CORE_PAGE_UPDATED_AT = {
  "/": new Date("2026-07-31T00:00:00.000Z"),
  "/china-ai-subscriptions": new Date("2026-07-31T00:00:00.000Z"),
  "/api-pricing": new Date("2026-07-31T00:00:00.000Z"),
  "/methodology": new Date("2026-07-31T00:00:00.000Z"),
  "/privacy": new Date("2026-07-31T00:00:00.000Z"),
} as const;

export const dynamic = "force-dynamic";

export function buildSitemap(
  snapshot: LandingCatalogSnapshot,
): MetadataRoute.Sitemap {
  const corePages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: CORE_PAGE_UPDATED_AT["/"],
    },
    {
      url: absoluteUrl("/china-ai-subscriptions"),
      lastModified: CORE_PAGE_UPDATED_AT["/china-ai-subscriptions"],
    },
    {
      url: absoluteUrl("/api-pricing"),
      lastModified: CORE_PAGE_UPDATED_AT["/api-pricing"],
    },
    {
      url: absoluteUrl("/methodology"),
      lastModified: CORE_PAGE_UPDATED_AT["/methodology"],
    },
    {
      url: absoluteUrl("/privacy"),
      lastModified: CORE_PAGE_UPDATED_AT["/privacy"],
    },
  ];
  const indexablePages = landingPages
    .map((page) => buildLandingPageData(page, snapshot))
    .filter((data) => data.quality.indexable);

  return [
    ...corePages,
    ...indexablePages.map(({ page, quality }) => ({
      url: absoluteUrl(landingPagePath(page)),
      lastModified: new Date(quality.pageModifiedAt),
    })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(await loadCachedLandingCatalogSnapshot());
}
