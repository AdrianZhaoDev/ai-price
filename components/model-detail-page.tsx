import Link from "next/link";
import { ModelProviderTable } from "@/components/model-provider-table";
import { StructuredData } from "@/components/structured-data";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  modelSeoDescription,
  modelSeoTitle,
  modelSnapshotSummary,
} from "@/lib/model-catalog/seo";
import type {
  ModelCatalogSummary,
  ModelDetail,
} from "@/lib/model-catalog/types";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import { absoluteUrl, modeHref } from "@/lib/seo";

function tokens(value: number | undefined, locale: Locale): string {
  return value === undefined
    ? "—"
    : value.toLocaleString(locale === "en" ? "en-US" : "zh-CN");
}

function yesNo(value: boolean | undefined, locale: Locale): string {
  return value === undefined
    ? "—"
    : value
      ? locale === "en"
        ? "Yes"
        : "是"
      : locale === "en"
        ? "No"
        : "否";
}

export function ModelDetailPage({
  model,
  relatedModels = [],
  locale = "zh-CN",
}: {
  model: ModelDetail;
  relatedModels?: ModelCatalogSummary[];
  locale?: Locale;
}) {
  const messages = getMessages(locale);
  const detailMessages = messages.modelDetail;
  const pageUrl = absoluteUrl(modelDetailPath(model.id, locale));
  const catalogUrl = absoluteUrl(modeHref("api", locale));
  const modelTitle = modelSeoTitle(model, locale);
  const snapshotSummary = modelSnapshotSummary(model, locale);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: messages.apiCatalog.title,
          item: catalogUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: model.name,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: modelTitle,
      description: modelSeoDescription(model, locale),
      identifier: model.id,
      url: pageUrl,
      inLanguage: locale === "en" ? "en" : "zh-CN",
      isAccessibleForFree: true,
      datePublished: model.releaseDate,
      dateModified: model.detailChangedAt ?? model.updatedDate,
      creator: { "@type": "Organization", name: model.labName },
      isPartOf: catalogUrl,
      license: "https://github.com/anomalyco/models.dev/blob/dev/LICENSE",
      isBasedOn: model.sourceUrl,
      variableMeasured: [
        {
          "@type": "PropertyValue",
          name: detailMessages.facts.context,
          value: model.context,
        },
        {
          "@type": "PropertyValue",
          name: detailMessages.facts.output,
          value: model.output,
        },
        {
          "@type": "PropertyValue",
          name:
            locale === "en"
              ? "Minimum non-zero input price (USD per million tokens)"
              : "最低非零输入价格（USD / 百万 tokens）",
          value: model.minInputPrice,
        },
        {
          "@type": "PropertyValue",
          name:
            locale === "en"
              ? "Minimum non-zero output price (USD per million tokens)"
              : "最低非零输出价格（USD / 百万 tokens）",
          value: model.minOutputPrice,
        },
      ].filter((measurement) => measurement.value !== undefined),
    },
  ];
  const facts: Array<[string, string]> = [
    [detailMessages.facts.id, model.id],
    [detailMessages.facts.lab, model.labName],
    [detailMessages.facts.family, model.family ?? "—"],
    [detailMessages.facts.providers, String(model.providerCount)],
    [detailMessages.facts.context, tokens(model.context, locale)],
    [detailMessages.facts.output, tokens(model.output, locale)],
    [detailMessages.facts.knowledge, model.knowledge ?? "—"],
    [detailMessages.facts.release, model.releaseDate],
    [
      detailMessages.facts.updated,
      (model.detailChangedAt ?? model.updatedDate).slice(0, 10),
    ],
    [
      detailMessages.facts.weights,
      model.openWeights
        ? detailMessages.openWeights
        : detailMessages.closedWeights,
    ],
    [detailMessages.facts.input, model.inputModalities.join(" · ") || "—"],
    [
      detailMessages.facts.outputTypes,
      model.outputModalities.join(" · ") || "—",
    ],
  ];
  const capabilities = [
    [locale === "en" ? "Reasoning" : "推理", model.capabilities.reasoning],
    [locale === "en" ? "Attachment" : "附件", model.capabilities.attachment],
    [detailMessages.providerColumns.toolCall, model.capabilities.toolCall],
    [
      detailMessages.providerColumns.structured,
      model.capabilities.structuredOutput,
    ],
    [
      detailMessages.providerColumns.temperature,
      model.capabilities.temperature,
    ],
  ] as const;

  return (
    <div className="app-shell model-detail-shell">
      <StructuredData data={structuredData} />
      <a className="skip-link" href="#main-content">
        {messages.common.skipToContent}
      </a>
      <SiteHeader locale={locale} activeMode="api" />
      <main id="main-content" className="main-content model-detail-main">
        <nav
          className="model-breadcrumb"
          aria-label={detailMessages.breadcrumb}
        >
          <Link href={modeHref("api", locale)}>
            {messages.apiCatalog.title}
          </Link>
          <span>/</span>
          <span>{model.name}</span>
        </nav>
        {!model.active ? (
          <div className="model-archived" role="status">
            {detailMessages.archived}
          </div>
        ) : null}
        <header className="model-detail-hero">
          <p className="eyebrow">
            {model.labName} · {detailMessages.origin[model.origin]}
          </p>
          <h1>{model.name}</h1>
          <p>{model.description ?? snapshotSummary}</p>
          <code>{model.id}</code>
        </header>
        <section className="model-snapshot" aria-labelledby="snapshot-title">
          <h2 id="snapshot-title">{detailMessages.snapshotTitle}</h2>
          <p>{snapshotSummary}</p>
        </section>
        <dl className="model-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <section
          className="model-capabilities"
          aria-labelledby="capability-title"
        >
          <h2 id="capability-title">{detailMessages.capabilities}</h2>
          <div>
            {capabilities.map(([label, value]) => (
              <span key={label} data-enabled={value || undefined}>
                {label} · {yesNo(value, locale)}
              </span>
            ))}
          </div>
        </section>
        <section
          className="model-provider-section"
          aria-labelledby="provider-title"
        >
          <div className="model-section-heading">
            <div>
              <p className="eyebrow">{detailMessages.servingOptions}</p>
              <h2 id="provider-title">{detailMessages.providers}</h2>
            </div>
            <span>{detailMessages.quoteCount(model.providers.length)}</span>
          </div>
          <ModelProviderTable providers={model.providers} locale={locale} />
        </section>
        {relatedModels.length ? (
          <section className="model-related" aria-labelledby="related-title">
            <div className="model-section-heading">
              <div>
                <h2 id="related-title">{detailMessages.relatedModels}</h2>
                <p>{detailMessages.relatedDescription}</p>
              </div>
            </div>
            <ul>
              {relatedModels.map((related) => (
                <li key={related.id}>
                  <Link href={modelDetailPath(related.id, locale)}>
                    <strong>{related.name}</strong>
                    <span>{related.labName}</span>
                    <small>{related.id}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <aside className="model-provenance">
          <strong>{detailMessages.provenanceTitle}</strong>
          <p>{detailMessages.provenanceDescription}</p>
          <a href={model.sourceUrl} target="_blank" rel="noreferrer">
            {detailMessages.viewCommit(model.catalogVersion.slice(0, 12))}
          </a>
        </aside>
      </main>
      <SiteFooter
        locale={locale}
        description={detailMessages.footerDescription}
      />
    </div>
  );
}
