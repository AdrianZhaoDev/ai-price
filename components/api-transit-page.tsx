import type { Locale } from "@/lib/i18n";
import { absoluteUrl, metadataForDocument } from "@/lib/seo";
import { listPublicTransitDirectoryEntries } from "@/lib/transit/directory";
import { SiteFooter, SiteHeader } from "./site-header";
import { TransitSubmissionForm } from "./transit-submission-form";
import type { PublicDirectorySearchParams } from "./channels-page";
import styles from "./transit-directory.module.css";

export const apiTransitPageMetadata = (locale: Locale) =>
  metadataForDocument({
    path: "/api-transit",
    title: locale === "en" ? "API Transit Directory" : "API 中转站目录",
    description:
      locale === "en"
        ? "Find AI API transit websites with short introductions and direct links. Submit a website for review, and check each operator's current service terms."
        : "浏览 AI API 中转站目录，通过网站名称、简短介绍和直达链接了解各站点服务，并可提交网站申请收录。收录申请须经审核后展示；使用前请到运营方网站核对可用模型、计费规则、服务条款及数据处理说明，目录收录不构成服务质量或价格保证。",
    locale,
  });
export async function ApiTransitPage({
  locale,
}: {
  locale: Locale;
  searchParams: PublicDirectorySearchParams;
}) {
  const en = locale === "en";
  const title = en ? "API transit stations" : "API 中转站";
  const stations = await listPublicTransitDirectoryEntries();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {en ? "Skip to content" : "跳转到正文"}
      </a>
      <SiteHeader locale={locale} activeMode="api-transit" />
      <main id="main-content" className={`main-content ${styles.page}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: title,
              url: absoluteUrl(`${en ? "/en" : ""}/api-transit`),
              numberOfItems: stations.length,
              itemListElement: stations.map((station, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: station.name,
                url: station.websiteUrl,
              })),
            }).replace(/</g, "\\u003c"),
          }}
        />
        <h1>{title}</h1>
        <table className={styles.table} aria-label={title}>
          <thead>
            <tr>
              <th scope="col">{en ? "Website" : "网站标题"}</th>
              <th scope="col">{en ? "Introduction" : "一句话介绍"}</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <tr key={station.websiteUrl}>
                <th scope="row">
                  <a
                    href={station.websiteUrl}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                  >
                    {station.name}
                  </a>
                </th>
                <td>{en ? station.descriptionEn : station.descriptionZh}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <TransitSubmissionForm locale={locale} />
      </main>
      <SiteFooter
        locale={locale}
        description={
          en ? "API transit website directory." : "API 中转站链接目录。"
        }
      />
    </div>
  );
}
