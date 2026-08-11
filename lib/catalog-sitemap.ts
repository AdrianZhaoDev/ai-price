import type { MetadataRoute } from "next";
import {
  buildLandingPageData,
  loadLandingCatalogSnapshot,
  type LandingCatalogSnapshot,
} from "@/lib/landing-page-data";
import { landingPages, landingPagePath } from "@/lib/landing-pages";
import { loadCachedModelCatalogSummaries } from "@/lib/model-catalog/cache";
import { isIndexableModelSummary } from "@/lib/model-catalog/discovery";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import type { ModelCatalogSummary } from "@/lib/model-catalog/types";
import { absoluteUrl } from "@/lib/seo";
import { localizedPath, type Locale } from "@/lib/i18n";

export const SITEMAP_PAGE_SIZE = 45_000;

const CORE_PAGE_UPDATED_AT = {
  "/": new Date("2026-08-11T00:00:00.000Z"),
  "/china-ai-subscriptions": new Date("2026-08-11T00:00:00.000Z"),
  "/api-pricing": new Date("2026-08-11T00:00:00.000Z"),
  "/methodology": new Date("2026-07-31T00:00:00.000Z"),
  "/privacy": new Date("2026-07-31T00:00:00.000Z"),
} as const;

const INDEXABLE_LOCALES: Locale[] = ["zh-CN", "en"];

function modelLastModified(model: ModelCatalogSummary): Date {
  if (model.detailChangedAt) return new Date(model.detailChangedAt);
  const date =
    model.updatedDate.length === 7
      ? `${model.updatedDate}-01`
      : model.updatedDate;
  return new Date(`${date}T00:00:00.000Z`);
}

export function buildSitemap(
  snapshot: LandingCatalogSnapshot,
  now = new Date(),
  models: ModelCatalogSummary[] = [],
): MetadataRoute.Sitemap {
  const corePages: MetadataRoute.Sitemap = INDEXABLE_LOCALES.flatMap((locale) =>
    Object.entries(CORE_PAGE_UPDATED_AT).map(([path, lastModified]) => ({
      url: absoluteUrl(localizedPath(locale, path)),
      lastModified,
    })),
  );
  const indexablePages = landingPages
    .map((page) => buildLandingPageData(page, snapshot, now))
    .filter((data) => data.quality.indexable);

  return [
    ...corePages,
    ...INDEXABLE_LOCALES.flatMap((locale) =>
      indexablePages.map(({ page, quality }) => ({
        url: absoluteUrl(landingPagePath(page, locale)),
        lastModified: new Date(quality.pageModifiedAt),
      })),
    ),
    ...INDEXABLE_LOCALES.flatMap((locale) =>
      models.filter(isIndexableModelSummary).map((model) => ({
        url: absoluteUrl(modelDetailPath(model.id, locale)),
        lastModified: modelLastModified(model),
      })),
    ),
  ];
}

export async function loadSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const [snapshot, models] = await Promise.all([
    loadLandingCatalogSnapshot(),
    loadCachedModelCatalogSummaries(),
  ]);
  return buildSitemap(snapshot, new Date(), models);
}

export function sitemapPageCount(entryCount: number): number {
  return Math.max(1, Math.ceil(entryCount / SITEMAP_PAGE_SIZE));
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

export function renderSitemapXml(entries: MetadataRoute.Sitemap): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(entry.url)}</loc>${entry.lastModified ? `<lastmod>${new Date(entry.lastModified).toISOString()}</lastmod>` : ""}</url>`,
    )
    .join("\n")}\n</urlset>`;
}

export function renderSitemapIndexXml(
  pageCount: number,
  lastModified: Date,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from({ length: pageCount }, (_, index) => `  <sitemap><loc>${escapeXml(absoluteUrl(`/sitemaps/${index + 1}.xml`))}</loc><lastmod>${lastModified.toISOString()}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>`;
}
