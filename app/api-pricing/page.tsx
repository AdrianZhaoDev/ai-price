import { ModelCatalogExplorer } from "@/components/model-catalog-explorer";
import { loadCachedModelCatalogSummaries } from "@/lib/model-catalog/cache";
import { parseModelCatalogFilters } from "@/lib/model-catalog/filters";
import { metadataForMode } from "@/lib/seo";
import { absoluteUrl } from "@/lib/seo";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import type { Metadata } from "next";

// CI builds do not have production database access. Render pricing routes on
// the server so a verified artifact never ships the seed catalog as live data.
export const revalidate = false;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const metadata = metadataForMode("api");
  return Object.keys(params).length > 0
    ? { ...metadata, robots: { index: false, follow: true } }
    : metadata;
}

export default async function ApiPricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const models = await loadCachedModelCatalogSummaries();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Low Price Radar API 价格排行榜",
      description:
        "AI 模型 API 价格排行榜，收录 models.dev canonical 模型规格与 provider 最低输入、输出价格。",
      url: absoluteUrl("/api-pricing"),
      license: "https://github.com/anomalyco/models.dev/blob/dev/LICENSE",
      isAccessibleForFree: true,
      dateModified: models
        .map((model) => model.detailChangedAt ?? model.updatedDate)
        .sort((left, right) => right.localeCompare(left))[0],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "API 价格排行榜模型列表",
      itemListOrder: "https://schema.org/ItemListUnordered",
      numberOfItems: models.length,
      itemListElement: models.map((model, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: model.name,
        url: absoluteUrl(modelDetailPath(model.id)),
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
        models={models}
        initialFilters={parseModelCatalogFilters(params)}
      />
    </>
  );
}
