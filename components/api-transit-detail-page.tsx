import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { absoluteUrl, metadataForDocument } from "@/lib/seo";
import type {
  TransitAvailability,
  TransitOffer,
  TransitStation,
} from "@/lib/transit/types";
import { SiteFooter, SiteHeader } from "./site-header";
import { TransitAvailabilityEvidence } from "./transit-availability-evidence";
import styles from "./public-data-directory.module.css";

function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return locale === "en" ? "Not recorded" : "未记录";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function rateCopy(availability: TransitAvailability, locale: Locale): string {
  if (availability.sevenDayRate === null || availability.sevenDaySamples < 1) {
    return locale === "en" ? "No attributed samples" : "暂无可归因样本";
  }
  const percent = new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(availability.sevenDayRate);
  return locale === "en"
    ? `${percent} (${availability.sevenDaySamples} samples)`
    : `${percent}（${availability.sevenDaySamples} 个样本）`;
}

function offerRate(offer: TransitOffer, locale: Locale): string {
  if (offer.billingMode === "token" && offer.combinedRate !== null) {
    return `${offer.combinedRate.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}×`;
  }
  if (offer.fixedPrice !== null) {
    const unit = offer.fixedPriceUnit ? ` / ${offer.fixedPriceUnit}` : "";
    return `${offer.fixedPrice} ${offer.fixedPriceCurrency ?? offer.currency}${unit}`;
  }
  return locale === "en" ? "Not directly comparable" : "不可直接比较";
}

function billingLabel(mode: TransitOffer["billingMode"], locale: Locale) {
  if (locale === "en") {
    return { token: "Token", per_request: "Per request", fixed: "Fixed" }[mode];
  }
  return { token: "Token 计费", per_request: "按次计费", fixed: "固定单价" }[
    mode
  ];
}

function statusLabel(
  station: TransitStation,
  locale: Locale,
  degraded: boolean,
): string {
  if (degraded)
    return locale === "en" ? "Stale or degraded data" : "数据过期或降级";
  if (station.synthetic)
    return locale === "en" ? "Synthetic fixture" : "合成演示数据";
  if (station.dataStatus === "verified")
    return locale === "en" ? "Verified" : "已核验";
  if (station.dataStatus === "sample")
    return locale === "en" ? "Sample" : "样本数据";
  return locale === "en" ? "Pending review" : "待审核";
}

export const apiTransitDetailMetadata = (locale: Locale, slug: string) =>
  metadataForDocument({
    path: `/api-transit/${encodeURIComponent(slug)}`,
    title: locale === "en" ? "API transit station details" : "API 中转站详情",
    description:
      locale === "en"
        ? "Review public pricing, source links, risk labels, and attributed availability samples for an API transit station."
        : "查看 API 中转站的公开价格、来源链接、风险标签和可归因可用性样本。",
    locale,
  });

export function ApiTransitDetailPage({
  locale,
  station,
  degraded,
}: {
  locale: Locale;
  station: TransitStation;
  degraded: boolean;
}) {
  const isEnglish = locale === "en";
  const path = isEnglish
    ? `/en/api-transit/${station.slug}`
    : `/api-transit/${station.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: station.name,
    description: station.summary,
    url: absoluteUrl(path),
    inLanguage: isEnglish ? "en" : "zh-CN",
    dateModified: station.lastUpdatedAt,
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "Low Price Radar" },
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {isEnglish ? "Skip to content" : "跳转到正文"}
      </a>
      <SiteHeader locale={locale} />
      <main id="main-content" className={`main-content ${styles.page}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <nav
          className={styles.subnav}
          aria-label={isEnglish ? "Directory navigation" : "目录导航"}
        >
          <Link href={isEnglish ? "/en/api-transit" : "/api-transit"}>
            {isEnglish ? "← API transit directory" : "← API 中转目录"}
          </Link>
          <Link href={isEnglish ? "/en/channels" : "/channels"}>
            {isEnglish ? "Channels" : "卡网报价"}
          </Link>
        </nav>

        <section className={styles.hero} aria-labelledby="transit-detail-title">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-line" aria-hidden="true" />
              {isEnglish ? "Station detail" : "站点详情"}
            </p>
            <h1 id="transit-detail-title">{station.name}</h1>
            <p className={styles.lead}>{station.summary}</p>
          </div>
          <div className={styles.heroAside}>
            <p>{statusLabel(station, locale, degraded)}</p>
            <p>
              {isEnglish ? "Last updated" : "最近更新"}:{" "}
              {formatDate(station.lastUpdatedAt, locale)}
            </p>
            <p>
              {isEnglish ? "Attributed availability" : "可归因可用性"}:{" "}
              {rateCopy(station.availability, locale)}
            </p>
            <TransitAvailabilityEvidence
              availability={station.availability}
              locale={locale}
            />
          </div>
        </section>

        <div
          className={styles.status}
          data-tone={
            !degraded && !station.synthetic && station.dataStatus === "verified"
              ? "ok"
              : "warning"
          }
          role="status"
        >
          <span className={styles.statusMark} aria-hidden="true" />
          <div>
            <strong>{statusLabel(station, locale, degraded)}</strong>
            <p>
              {station.synthetic
                ? isEnglish
                  ? "This is a deterministic development fixture, not a live station check."
                  : "这是确定性的开发示例，不是实时站点探测。"
                : isEnglish
                  ? "Availability describes only the attributed scope and sample window below."
                  : "可用性只描述下方注明的范围和样本窗口。"}
            </p>
          </div>
        </div>

        <section
          className={styles.stats}
          aria-label={isEnglish ? "Station summary" : "站点概览"}
        >
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Offers" : "报价"}
            </span>
            <strong className={styles.statValue}>
              {station.offers.length}
            </strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "System" : "系统"}
            </span>
            <strong className={styles.statValue}>
              {station.stationSystem}
            </strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Channel" : "渠道"}
            </span>
            <strong className={styles.statValue}>
              {station.channelTypes[0] ?? "—"}
            </strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Samples" : "样本"}
            </span>
            <strong className={styles.statValue}>
              {station.availability.sevenDaySamples}
            </strong>
          </div>
        </section>

        <section aria-labelledby="transit-offers-title">
          <div className={styles.sectionHeader}>
            <h2 id="transit-offers-title">
              {isEnglish ? "Public offers" : "公开报价"}
            </h2>
            <p>
              {isEnglish
                ? "Unlike billing units are kept separate"
                : "不同计费单位分开展示"}
            </p>
          </div>
          {station.offers.length ? (
            <ul className={styles.offerList}>
              {station.offers.map((offer) => (
                <li className={styles.offerCard} key={offer.id}>
                  <div className={styles.offerTitle}>
                    <strong>{offer.standardModelLabel}</strong>
                    <span>
                      {offer.family} · {offer.groupName} ·{" "}
                      {billingLabel(offer.billingMode, locale)}
                    </span>
                  </div>
                  <div className={styles.offerPrice}>
                    <strong>{offerRate(offer, locale)}</strong>
                    <span>{offer.currency}</span>
                    {offer.billingMode === "token" &&
                    offer.inputPrice !== null ? (
                      <span>
                        {isEnglish ? "Input" : "输入"}:{" "}
                        {offer.inputPrice.toLocaleString(
                          isEnglish ? "en-US" : "zh-CN",
                          { maximumFractionDigits: 8 },
                        )}{" "}
                        {offer.currency} /{" "}
                        {isEnglish ? "1M tokens" : "百万 tokens"}
                      </span>
                    ) : null}
                    {offer.billingMode === "token" &&
                    offer.outputPrice !== null ? (
                      <span>
                        {isEnglish ? "Output" : "输出"}:{" "}
                        {offer.outputPrice.toLocaleString(
                          isEnglish ? "en-US" : "zh-CN",
                          { maximumFractionDigits: 8 },
                        )}{" "}
                        {offer.currency} /{" "}
                        {isEnglish ? "1M tokens" : "百万 tokens"}
                      </span>
                    ) : null}
                    {offer.priceSourceLabel ? (
                      <span>{offer.priceSourceLabel}</span>
                    ) : null}
                  </div>
                  <div>
                    <span
                      className={styles.pill}
                      data-tone={
                        offer.availability.sevenDaySamples > 0 &&
                        offer.availability.sevenDayRate === 0
                          ? "warning"
                          : undefined
                      }
                    >
                      {rateCopy(offer.availability, locale)}
                    </span>
                    <TransitAvailabilityEvidence
                      availability={offer.availability}
                      locale={locale}
                    />
                  </div>
                  {offer.priceSourceUrl ? (
                    <a
                      className={styles.sourceLink}
                      href={offer.priceSourceUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                    >
                      {isEnglish ? "Price source" : "价格来源"}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <strong>{isEnglish ? "No public offers" : "暂无公开报价"}</strong>
              <p>
                {isEnglish
                  ? "The station is listed, but no public price row has passed review."
                  : "站点已收录，但尚无通过审核的公开价格行。"}
              </p>
            </div>
          )}
        </section>

        <section
          className={styles.productGrid}
          aria-label={isEnglish ? "Station evidence" : "站点证据"}
        >
          <article className={styles.productCard}>
            <h3>{isEnglish ? "Source and relationship" : "来源与关系"}</h3>
            <p className={styles.small}>
              {station.sourceLabel ?? station.sourceType}
            </p>
            <p className={styles.small}>
              {isEnglish ? "Commercial relation" : "商业关系"}:{" "}
              {station.commercialRelation}
            </p>
            <div className={styles.productMeta}>
              {station.websiteUrl ? (
                <a
                  className={styles.sourceLink}
                  href={station.websiteUrl}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                >
                  {isEnglish ? "Visit station" : "访问站点"}
                </a>
              ) : null}
              {station.sourceUrl ? (
                <a
                  className={styles.sourceLink}
                  href={station.sourceUrl}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                >
                  {isEnglish ? "Open source" : "打开来源"}
                </a>
              ) : null}
            </div>
          </article>
          <article className={styles.productCard}>
            <h3>{isEnglish ? "Risk and usage" : "风险与使用"}</h3>
            <div className={styles.productMeta}>
              {station.riskLabels.length ? (
                station.riskLabels.map((label) => (
                  <span className={styles.pill} data-tone="warning" key={label}>
                    {label.replaceAll("_", " ")}
                  </span>
                ))
              ) : (
                <span className={styles.pill}>
                  {isEnglish ? "No risk label" : "暂无风险标签"}
                </span>
              )}
            </div>
            <p className={styles.small}>
              {isEnglish ? "Advice" : "建议"}:{" "}
              {station.usageAdvice.replaceAll("_", " ")}
            </p>
            <p className={styles.small}>
              {isEnglish ? "Payment" : "付款"}:{" "}
              {station.paymentMethods.join(", ") ||
                (isEnglish ? "Not recorded" : "未记录")}
            </p>
          </article>
        </section>

        <p className={styles.footnote}>
          {isEnglish
            ? "This page reads the latest published snapshot only. It does not send requests through the station or claim that a third-party status page covers every model."
            : "本页只读取最近发布的快照，不会通过中转站发起请求，也不会把第三方状态页描述成覆盖全部模型。"}
          {degraded
            ? ` ${isEnglish ? "The snapshot is currently degraded." : "当前快照处于降级状态。"}`
            : ""}
        </p>
      </main>
      <SiteFooter
        locale={locale}
        description={
          isEnglish
            ? "Public API transit station detail with explicit source and sample boundaries."
            : "明确标注来源和样本边界的公开 API 中转站详情。"
        }
      />
    </div>
  );
}
