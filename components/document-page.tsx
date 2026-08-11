import Link from "next/link";
import { StructuredData } from "@/components/structured-data";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getMessages, type Locale } from "@/lib/i18n";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export function DocumentPage({
  document,
  locale = "zh-CN",
}: {
  document: "methodology" | "privacy";
  locale?: Locale;
}) {
  const messages = getMessages(locale).documents;
  const isMethodology = document === "methodology";
  const eyebrow = isMethodology
    ? messages.methodologyEyebrow
    : messages.privacyEyebrow;
  const title = isMethodology
    ? messages.methodologyTitle
    : messages.privacyTitle;
  const lead = isMethodology ? messages.methodologyLead : messages.privacyLead;
  const sections = isMethodology
    ? messages.methodologySections
    : messages.privacySections;
  const path = locale === "en" ? `/en/${document}` : `/${document}`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description: lead,
      url: absoluteUrl(path),
      inLanguage: locale === "en" ? "en" : "zh-CN",
      isPartOf: {
        "@type": "WebSite",
        name: SITE_NAME,
        url: absoluteUrl(locale === "en" ? "/en" : "/"),
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
          item: absoluteUrl(locale === "en" ? "/en" : "/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: title,
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
      <main id="main-content" className="main-content document-main">
        <Link className="document-back" href={locale === "en" ? "/en" : "/"}>
          {messages.back}
        </Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="document-lead">{lead}</p>
        <div className="document-sections">
          {sections.map((section, index) => (
            <section
              key={section.title}
              id={
                isMethodology && index === sections.length - 1
                  ? "data-corrections"
                  : undefined
              }
            >
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {isMethodology && section === sections[0] ? (
                <a
                  href="https://github.com/anomalyco/models.dev/blob/dev/LICENSE"
                  target="_blank"
                  rel="noreferrer"
                >
                  {locale === "en"
                    ? "View the MIT license ↗"
                    : "查看 MIT 许可证 ↗"}
                </a>
              ) : null}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter
        locale={locale}
        description={
          isMethodology
            ? getMessages(locale).pricing.footerDescription
            : messages.footerDescription
        }
      />
    </div>
  );
}
