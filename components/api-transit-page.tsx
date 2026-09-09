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
        ? "Browse API transit website links or submit a website for inclusion."
        : "浏览 API 中转站链接，或提交网址申请收录。",
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
