import { ModelCatalogExplorer } from "@/components/model-catalog-explorer";
import { ModelDirectory } from "@/components/model-directory";
import { loadCachedModelCatalogSummaries } from "@/lib/model-catalog/cache";
import {
  buildModelCatalogFacets,
  isIndexableModelSummary,
} from "@/lib/model-catalog/discovery";
import {
  filterAndSortModelCatalog,
  parseModelCatalogFilters,
} from "@/lib/model-catalog/filters";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import { getMessages, type Locale } from "@/lib/i18n";
import { absoluteUrl, modeSeoByLocale } from "@/lib/seo";

export const revalidate = false;
export const MODEL_CATALOG_PAGE_SIZE = 60;

function requestedPage(
  value: string | string[] | undefined,
  pageCount: number,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Math.min(
    Math.max(Number.isSafeInteger(parsed) ? parsed : 1, 1),
    pageCount,
  );
}

export async function ApiPricingPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const allModels = await loadCachedModelCatalogSummaries();
  const indexableModels = allModels.filter(isIndexableModelSummary);
  const filters = parseModelCatalogFilters(params);
  const filteredModels = filterAndSortModelCatalog(indexableModels, filters);
  const pageCount = Math.max(
    1,
    Math.ceil(filteredModels.length / MODEL_CATALOG_PAGE_SIZE),
  );
  const page = requestedPage(params.page, pageCount);
  const start = (page - 1) * MODEL_CATALOG_PAGE_SIZE;
  const models = filteredModels.slice(start, start + MODEL_CATALOG_PAGE_SIZE);
  const messages = getMessages(locale);
  const seo = modeSeoByLocale[locale].api;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: seo.title,
      description: seo.description,
      url: absoluteUrl(seo.path),
      inLanguage: locale === "en" ? "en" : "zh-CN",
      creator: { "@type": "Organization", name: "Low Price Radar" },
      license: "https://github.com/anomalyco/models.dev/blob/dev/LICENSE",
      isAccessibleForFree: true,
      dateModified: indexableModels
        .map((model) => model.detailChangedAt ?? model.updatedDate)
        .sort((left, right) => right.localeCompare(left))[0],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: messages.apiCatalog.title,
      itemListOrder: "https://schema.org/ItemListUnordered",
      numberOfItems: models.length,
      itemListElement: models.map((model, index) => ({
        "@type": "ListItem",
        position: start + index + 1,
        name: model.name,
        url: absoluteUrl(modelDetailPath(model.id, locale)),
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ModelCatalogExplorer
        locale={locale}
        models={models}
        facets={buildModelCatalogFacets(indexableModels)}
        initialFilters={filters}
        totalCount={filteredModels.length}
        currentPage={page}
        pageCount={pageCount}
      >
        <ModelDirectory locale={locale} models={indexableModels} />
      </ModelCatalogExplorer>
    </>
  );
}
