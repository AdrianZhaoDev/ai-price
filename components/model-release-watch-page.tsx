import Link from "next/link";
import { StructuredData } from "@/components/structured-data";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  hotModelReleases,
  modelReleaseWatchCopy,
  modelReleaseWatchPath,
  MODEL_RELEASE_WATCH_UPDATED_AT,
} from "@/lib/model-release-watch";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export function ModelReleaseWatchPage({
  locale = "zh-CN",
}: {
  locale?: Locale;
}) {
  const copy = modelReleaseWatchCopy(locale);
  const path = modelReleaseWatchPath(locale);
  const homePath = locale === "en" ? "/en" : "/";
  const apiPath = locale === "en" ? "/en/api-pricing" : "/api-pricing";
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: copy.heading,
      description: copy.lead,
      url: absoluteUrl(path),
      inLanguage: locale === "en" ? "en" : "zh-CN",
      datePublished: MODEL_RELEASE_WATCH_UPDATED_AT,
      dateModified: MODEL_RELEASE_WATCH_UPDATED_AT,
      author: {
        "@type": "Organization",
        name: SITE_NAME,
        url: absoluteUrl(homePath),
      },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        url: absoluteUrl(homePath),
      },
      keywords: hotModelReleases.map((release) => release.name),
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": absoluteUrl(path),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: SITE_NAME,
          item: absoluteUrl(homePath),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: copy.heading,
          item: absoluteUrl(path),
        },
      ],
    },
  ];

  return (
    <div className="app-shell document-shell">
      <StructuredData data={structuredData} />
      <a className="skip-link" href="#main-content">
        {getMessages(locale).common.skipToContent}
      </a>
      <SiteHeader locale={locale} />
      <main id="main-content" className="document-page">
        <Link className="document-back" href={apiPath}>
          {copy.back}
        </Link>
        <p className="eyebrow">
          <span className="eyebrow-line" />
          {copy.eyebrow}
        </p>
        <h1>{copy.heading}</h1>
        <p className="document-lead">{copy.lead}</p>
        <p className="document-updated">{copy.lastChecked}</p>

        <div className="document-sections">
          {hotModelReleases.map((release) => (
            <section key={release.key} id={release.key}>
              <h2>{release.name}</h2>
              <p>{release.status[locale]}</p>
              <p>{release.summary[locale]}</p>
              <p>
                <strong>{copy.contextLabel}：</strong> {release.context}
              </p>
              <p>
                <strong>{copy.priceLabel}：</strong>{" "}
                {release.priceSnapshot[locale]}
              </p>
              <p>
                <strong>{copy.sourcesLabel}：</strong>{" "}
                {release.sourceLinks.map((source, index) => (
                  <span key={source.url}>
                    {index > 0 ? " · " : null}
                    <a
                      className="document-inline-link"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.label[locale]} ↗
                    </a>
                  </span>
                ))}
              </p>
              <p>
                <Link
                  className="document-inline-link"
                  href={
                    locale === "en"
                      ? `/en${release.internalPath}`
                      : release.internalPath
                  }
                  rel={
                    release.internalPath.includes("?") ? "nofollow" : undefined
                  }
                  prefetch={false}
                >
                  {copy.brandLink}：{release.labName} ↗
                </Link>
              </p>
            </section>
          ))}

          <section>
            <h2>{copy.methodologyHeading}</h2>
            <p>{copy.methodology}</p>
            <p>
              <Link className="document-inline-link" href={apiPath}>
                {copy.catalogLink} ↗
              </Link>
            </p>
          </section>
        </div>
      </main>
      <SiteFooter
        locale={locale}
        description={
          locale === "en"
            ? "Compare official AI subscription and API prices with traceable sources."
            : "比较 AI 官方订阅与 API 价格，保留可追溯的来源和核验时间。"
        }
      />
    </div>
  );
}
