import { ModelCatalogExplorer } from "@/components/model-catalog-explorer";
import { loadCachedModelCatalogSummaries } from "@/lib/model-catalog/cache";
import { parseModelCatalogFilters } from "@/lib/model-catalog/filters";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import { getMessages, type Locale } from "@/lib/i18n";
import { absoluteUrl, modeSeoByLocale } from "@/lib/seo";

export const revalidate = false;

export async function ApiPricingPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const models = await loadCachedModelCatalogSummaries();
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
      license: "https://github.com/anomalyco/models.dev/blob/dev/LICENSE",
      isAccessibleForFree: true,
      dateModified: models
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
        position: index + 1,
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
        initialFilters={parseModelCatalogFilters(params)}
      />
    </>
  );
}
