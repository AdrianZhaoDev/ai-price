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
import Link from "next/link";

export const revalidate = false;
export const MODEL_CATALOG_PAGE_SIZE = 60;

function apiFaq(locale: Locale) {
  const isEnglish = locale === "en";
  return [
    {
      question: isEnglish
        ? "How are API prices compared?"
        : "API 价格如何比较？",
      answer: isEnglish
        ? "The table keeps each provider's published billing unit visible and compares input, cached-input, and output prices per million tokens when the source provides them."
        : "目录保留各 Provider 的官方计费单位；官方提供时，按每百万 Token 展示输入、缓存输入和输出价格，避免混淆不同计费口径。",
    },
    {
      question: isEnglish
        ? "Are these prices official and current?"
        : "这些价格是否官方且及时？",
      answer: isEnglish
        ? "Each model record keeps its source and update context. Prices can change, so confirm availability and the final amount on the cited official page before purchase or production use."
        : "每条模型记录保留来源和更新时间。价格可能变化，在购买或用于生产前，请继续以引用的官方页面确认可用性和最终金额。",
    },
    {
      question: isEnglish
        ? "Why do filtered catalog URLs not appear in search?"
        : "为什么带筛选条件的目录链接不会出现在搜索中？",
      answer: isEnglish
        ? "Provider, model, and pagination filters are useful for browsing but canonicalize to this directory and are marked noindex, so search engines focus on stable content pages."
        : "Provider、模型和分页筛选适合浏览，但会规范化到本目录并标记为 noindex，使搜索引擎聚焦稳定的内容页。",
    },
  ];
}

function ApiPricingFaq({ locale }: { locale: Locale }) {
  const isEnglish = locale === "en";
  const geminiPath =
    locale === "en" ? "/en/gemini-pro-price" : "/gemini-pro-price";
  return (
    <section
      className="model-catalog-faq"
      aria-labelledby="api-pricing-faq-title"
    >
      <div>
        <p className="eyebrow">{isEnglish ? "Pricing context" : "价格口径"}</p>
        <h2 id="api-pricing-faq-title">
          {isEnglish ? "API pricing FAQ" : "API 价格常见问题"}
        </h2>
      </div>
      <div>
        {apiFaq(locale).map((item) => (
          <article key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
        <Link href={geminiPath} className="model-release-watch-link">
          {isEnglish
            ? "Compare Google AI Pro regional subscription prices"
            : "查看 Google AI Pro 全球订阅价格"}
        </Link>
      </div>
    </section>
  );
}

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
  const faq = apiFaq(locale);
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
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
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
        <ApiPricingFaq locale={locale} />
      </ModelCatalogExplorer>
    </>
  );
}
