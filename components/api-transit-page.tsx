import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { absoluteUrl, metadataForDocument } from "@/lib/seo";
import { getTransitStations } from "@/lib/transit/repository";
import {
  TRANSIT_ACCOUNT_POOLS,
  TRANSIT_CHANNEL_TYPES,
  TRANSIT_RISK_LABELS,
  TRANSIT_SORT_KEYS,
  type TransitAvailability,
  type TransitListQuery,
  type TransitListResult,
  type TransitOffer,
  type TransitStation,
} from "@/lib/transit/types";
import { SiteFooter, SiteHeader } from "./site-header";
import { TransitAvailabilityEvidence } from "./transit-availability-evidence";
import type { PublicDirectorySearchParams } from "./channels-page";
import styles from "./public-data-directory.module.css";

function firstValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim();
  return trimmed || undefined;
}

function isIncluded<const Values extends readonly string[]>(
  values: Values,
  value: string | undefined,
): value is Values[number] {
  return value !== undefined && values.includes(value);
}

function boundedLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "20", 10);
  return Number.isSafeInteger(parsed) ? Math.min(Math.max(parsed, 1), 50) : 20;
}

function transitQueryFromParams(
  params: Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  const q = firstValue(params.q)?.slice(0, 100);
  const family = firstValue(params.family)?.slice(0, 40);
  const model = firstValue(params.model)?.slice(0, 160);
  const channel = firstValue(params.channel);
  const pool = firstValue(params.pool);
  const risk = firstValue(params.risk);
  const sort = firstValue(params.sort);
  const cursor = firstValue(params.cursor);
  return {
    ...(q ? { q } : {}),
    ...(family ? { family } : {}),
    ...(model ? { model } : {}),
    ...(isIncluded(TRANSIT_CHANNEL_TYPES, channel) ? { channel } : {}),
    ...(isIncluded(TRANSIT_ACCOUNT_POOLS, pool) ? { pool } : {}),
    ...(isIncluded(TRANSIT_RISK_LABELS, risk) ? { risk } : {}),
    ...(isIncluded(TRANSIT_SORT_KEYS, sort) ? { sort } : { sort: "overall" }),
    limit: boundedLimit(firstValue(params.limit)),
    ...(cursor && /^o[0-9a-z]+$/i.test(cursor) ? { cursor } : {}),
  };
}

function emptyTransitResult(locale: Locale): TransitListResult {
  return {
    items: [],
    stations: [],
    total: 0,
    nextCursor: null,
    generatedAt: new Date().toISOString(),
    generationId: "transit-page-degraded",
    sourcePolicyVersion: "transit-policy-v1",
    origin: "database",
    isSynthetic: false,
    degraded: true,
    dataStatus: "degraded",
    fallbackReason: "database_unavailable",
    dataSource: "database",
    warning:
      locale === "en"
        ? "The public transit snapshot could not be read."
        : "暂时无法读取公开 API 中转快照。",
    query: {
      sort: "overall",
      limit: 20,
      includeUnpublished: false,
    },
  };
}

function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return locale === "en" ? "Not recorded" : "未记录";
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function decimal(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(value);
}

function formatAmount(value: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: 8,
    }).format(value);
  } catch {
    return `${currency} ${decimal(value)}`;
  }
}

function availabilityCopy(
  availability: TransitAvailability,
  locale: Locale,
): string {
  if (availability.sevenDayRate === null || availability.sevenDaySamples <= 0) {
    return locale === "en" ? "No 7-day samples" : "暂无 7 天样本";
  }
  const rate = new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(availability.sevenDayRate);
  return locale === "en"
    ? `${rate} · ${availability.sevenDaySamples} samples`
    : `${rate} · ${availability.sevenDaySamples} 个样本`;
}

function billingModeLabel(mode: TransitOffer["billingMode"], locale: Locale) {
  if (locale === "en") {
    return { token: "Token", per_request: "Per request", fixed: "Fixed" }[mode];
  }
  return { token: "Token 计费", per_request: "按次计费", fixed: "固定单价" }[
    mode
  ];
}

function offerRate(offer: TransitOffer, locale: Locale): string {
  if (offer.billingMode === "token" && offer.combinedRate !== null) {
    return locale === "en"
      ? `${decimal(offer.combinedRate)}× combined coefficient`
      : `${decimal(offer.combinedRate)}× 综合系数`;
  }
  if (offer.fixedPrice !== null) {
    const unit = offer.fixedPriceUnit
      ? locale === "en"
        ? ` / ${offer.fixedPriceUnit}`
        : ` / ${offer.fixedPriceUnit}`
      : "";
    return `${formatAmount(
      offer.fixedPrice,
      offer.fixedPriceCurrency ?? offer.currency,
      locale,
    )}${unit}`;
  }
  return locale === "en" ? "Not comparable" : "不可直接比较";
}

function offerPriceNote(offer: TransitOffer, locale: Locale): string {
  if (offer.billingMode !== "token") {
    return locale === "en"
      ? "Kept outside token-cost ranking"
      : "不进入 Token 成本排序";
  }
  const pieces: string[] = [];
  if (offer.inputPrice !== null) {
    pieces.push(
      `${locale === "en" ? "input" : "输入"} ${decimal(offer.inputPrice)}`,
    );
  }
  if (offer.outputPrice !== null) {
    pieces.push(
      `${locale === "en" ? "output" : "输出"} ${decimal(offer.outputPrice)}`,
    );
  }
  return pieces.length
    ? `${pieces.join(" · ")} ${offer.currency} / ${locale === "en" ? "1M tokens" : "百万 tokens"}`
    : locale === "en"
      ? "No token-unit price published"
      : "未发布 Token 单位价";
}

function usageAdviceLabel(
  advice: TransitStation["usageAdvice"],
  locale: Locale,
): string {
  if (locale === "en") {
    return {
      try_small: "Try with a small amount",
      cautious: "Use cautiously",
      not_recommended: "Not recommended",
      pending: "Assessment pending",
    }[advice];
  }
  return {
    try_small: "建议小额试用",
    cautious: "谨慎使用",
    not_recommended: "不建议使用",
    pending: "评估待定",
  }[advice];
}

function statusCopy(result: TransitListResult, locale: Locale): string {
  if (result.isSynthetic) {
    return locale === "en" ? "Synthetic fixture" : "合成演示数据";
  }
  if (result.degraded) {
    return locale === "en" ? "Verified data unavailable" : "暂无已核验数据";
  }
  return locale === "en" ? "Published database snapshot" : "已发布数据库快照";
}

function statusDescription(result: TransitListResult, locale: Locale): string {
  if (result.warning) return result.warning;
  if (result.isSynthetic) {
    return locale === "en"
      ? "Examples use reserved test domains and are not live stations or uptime probes."
      : "示例使用保留测试域名，不是真实中转站或在线探测。";
  }
  if (result.degraded) {
    return locale === "en"
      ? `Public data is unavailable (${result.fallbackReason ?? "unknown"}).`
      : `公开数据暂不可用（${result.fallbackReason ?? "unknown"}）。`;
  }
  return locale === "en"
    ? "Only public, reviewed stations and offers are returned."
    : "仅返回可公开且已审核的站点和报价。";
}

function transitHref(
  path: string,
  query: TransitListQuery,
  cursor: string,
): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.family) params.set("family", query.family);
  if (query.model) params.set("model", query.model);
  if (query.channel) params.set("channel", query.channel);
  if (query.pool) params.set("pool", query.pool);
  if (query.risk) params.set("risk", query.risk);
  params.set("sort", query.sort);
  params.set("limit", String(query.limit));
  params.set("cursor", cursor);
  return `${path}?${params.toString()}`;
}

function transitStructuredData(
  result: TransitListResult,
  locale: Locale,
  path: string,
) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name:
        locale === "en"
          ? "Public API transit directory"
          : "公开 API 中转站目录",
      description:
        locale === "en"
          ? "A read-only directory of reviewed API transit station pricing and observed availability."
          : "只读的 API 中转站价格与可用性观测目录。",
      url: absoluteUrl(path),
      inLanguage: locale === "en" ? "en" : "zh-CN",
      isAccessibleForFree: true,
      dateModified: result.generatedAt,
      creator: { "@type": "Organization", name: "Low Price Radar" },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: locale === "en" ? "API transit stations" : "API 中转站",
      numberOfItems: result.items.length,
      itemListElement: result.items.map((station, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: station.name,
      })),
    },
  ];
}

export const apiTransitPageMetadata = (locale: Locale) =>
  metadataForDocument({
    path: "/api-transit",
    title:
      locale === "en" ? "Public API Transit Directory" : "公开 API 中转站目录",
    description:
      locale === "en"
        ? "Compare reviewed API transit station pricing, combined coefficients, channel type, account pool, and observed availability with explicit sample and degraded-data labels."
        : "比较已审核 API 中转站的价格、综合系数、渠道类型、账号池和观测可用性，并明确标注样本与降级数据。",
    locale,
    keywords:
      locale === "en"
        ? ["API transit directory", "AI API relay", "API availability"]
        : ["API 中转站", "AI API 中转", "API 可用性"],
  });

export async function ApiTransitPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: PublicDirectorySearchParams;
}) {
  const params = await searchParams;
  const queryInput = transitQueryFromParams(params);
  let result: TransitListResult;
  try {
    result = await getTransitStations(queryInput);
  } catch {
    result = emptyTransitResult(locale);
  }
  const isEnglish = locale === "en";
  const path = isEnglish ? "/en/api-transit" : "/api-transit";
  const totalOffers = result.items.reduce(
    (count, station) => count + station.offers.length,
    0,
  );
  const observedStations = result.items.filter(
    (station) => station.availability.sevenDaySamples > 0,
  ).length;
  const tokenOffers = result.items.reduce(
    (count, station) =>
      count +
      station.offers.filter((offer) => offer.billingMode === "token").length,
    0,
  );
  const structuredData = transitStructuredData(result, locale, path);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {isEnglish ? "Skip to content" : "跳转到正文"}
      </a>
      <SiteHeader locale={locale} activeMode="api-transit" />
      <main id="main-content" className={`main-content ${styles.page}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />

        <section className={styles.hero} aria-labelledby="transit-title">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-line" aria-hidden="true" />
              {isEnglish ? "Independent directory" : "独立目录"}
            </p>
            <h1 id="transit-title">
              {isEnglish
                ? "Inspect API transit offers with context."
                : "带着上下文查看 API 中转报价。"}
            </h1>
            <p className={styles.lead}>
              {isEnglish
                ? "Token coefficients, fixed-price units, channel types, account pools, and observed availability remain separate so unlike offers are not ranked together."
                : "Token 系数、固定单价、渠道类型、账号池和可用性观测分开展示，避免把不同口径强行排序。"}
            </p>
          </div>
          <div className={styles.heroAside}>
            <p>
              {isEnglish
                ? "Directory entries are not endorsements. Availability is based only on attributed samples."
                : "目录收录不代表推荐；可用性仅基于注明来源的样本。"}
            </p>
            <p>
              {isEnglish ? "Snapshot time" : "快照时间"}:{" "}
              {formatDate(result.generatedAt, locale)}
            </p>
          </div>
        </section>

        <div
          className={styles.status}
          data-tone={!result.isSynthetic && !result.degraded ? "ok" : "warning"}
          role="status"
          aria-live="polite"
        >
          <span className={styles.statusMark} aria-hidden="true" />
          <div>
            <strong>{statusCopy(result, locale)}</strong>
            <p>{statusDescription(result, locale)}</p>
          </div>
        </div>

        <section
          className={styles.stats}
          aria-label={isEnglish ? "Directory summary" : "目录概览"}
        >
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Stations" : "站点"}
            </span>
            <strong className={styles.statValue}>{result.total}</strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Visible offers" : "可见报价"}
            </span>
            <strong className={styles.statValue}>{totalOffers}</strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Token offers" : "Token 报价"}
            </span>
            <strong className={styles.statValue}>{tokenOffers}</strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Observed" : "有观测样本"}
            </span>
            <strong className={styles.statValue}>{observedStations}</strong>
          </div>
        </section>

        <form className={styles.toolbar} method="get" action={path}>
          <div className={styles.field}>
            <label htmlFor="transit-query">
              {isEnglish ? "Search" : "搜索"}
            </label>
            <input
              id="transit-query"
              name="q"
              type="search"
              defaultValue={result.query.q ?? ""}
              placeholder={isEnglish ? "Station or model" : "站点或模型"}
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="transit-family">
              {isEnglish ? "Model family" : "模型族"}
            </label>
            <input
              id="transit-family"
              name="family"
              defaultValue={result.query.family ?? ""}
              placeholder={isEnglish ? "e.g. gpt" : "例如 gpt"}
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="transit-channel">
              {isEnglish ? "Channel" : "渠道"}
            </label>
            <select
              id="transit-channel"
              name="channel"
              defaultValue={result.query.channel ?? ""}
            >
              <option value="">
                {isEnglish ? "All channels" : "全部渠道"}
              </option>
              {TRANSIT_CHANNEL_TYPES.map((channel) => (
                <option key={channel} value={channel}>
                  {channel.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="transit-sort">{isEnglish ? "Sort" : "排序"}</label>
            <select
              id="transit-sort"
              name="sort"
              defaultValue={result.query.sort}
            >
              <option value="overall">
                {isEnglish ? "Overall context" : "综合信息"}
              </option>
              <option value="rate">
                {isEnglish ? "Combined coefficient" : "综合系数"}
              </option>
              <option value="stability">
                {isEnglish ? "Observed availability" : "观测可用性"}
              </option>
              <option value="updated">
                {isEnglish ? "Recently updated" : "最近更新"}
              </option>
              <option value="name">{isEnglish ? "Name" : "名称"}</option>
            </select>
          </div>
          <button className={styles.button} type="submit">
            {isEnglish ? "Apply" : "应用筛选"}
          </button>
          <Link className={styles.reset} href={path}>
            {isEnglish ? "Reset" : "重置"}
          </Link>
        </form>

        <section aria-labelledby="transit-stations-title">
          <div className={styles.sectionHeader}>
            <h2 id="transit-stations-title">
              {isEnglish ? "Stations" : "站点"}
            </h2>
            <p>
              {isEnglish
                ? `${result.items.length} shown · ${result.total} matched`
                : `显示 ${result.items.length} 个 · 匹配 ${result.total} 个`}
            </p>
          </div>
          {result.items.length ? (
            <div className={styles.stationGrid}>
              {result.items.map((station) => (
                <article className={styles.stationCard} key={station.id}>
                  <div className={styles.stationOfferHeader}>
                    <h3>
                      <Link
                        className={styles.productLink}
                        href={`${path}/${encodeURIComponent(station.slug)}`}
                      >
                        {station.name}
                      </Link>
                    </h3>
                    <span
                      className={styles.pill}
                      data-tone={
                        station.status === "active" ? "positive" : "warning"
                      }
                    >
                      {station.status}
                    </span>
                  </div>
                  <p className={styles.small}>{station.summary}</p>
                  <div className={styles.stationMeta}>
                    <span
                      className={styles.pill}
                      data-tone={station.synthetic ? "warning" : undefined}
                    >
                      {station.dataStatus}
                    </span>
                    <span className={styles.pill}>
                      {usageAdviceLabel(station.usageAdvice, locale)}
                    </span>
                    {station.channelTypes.slice(0, 3).map((channel) => (
                      <span className={styles.pill} key={channel}>
                        {channel.replaceAll("_", " ")}
                      </span>
                    ))}
                    {station.riskLabels.map((risk) => (
                      <span
                        className={styles.pill}
                        data-tone="warning"
                        key={risk}
                      >
                        {risk.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                  <p className={styles.small}>
                    {isEnglish ? "Observed availability" : "观测可用性"}:{" "}
                    {availabilityCopy(station.availability, locale)}
                  </p>
                  <TransitAvailabilityEvidence
                    availability={station.availability}
                    locale={locale}
                  />
                  <p className={styles.small}>
                    {isEnglish ? "Updated" : "更新"}:{" "}
                    {formatDate(station.lastUpdatedAt, locale)}
                  </p>

                  <div className={styles.stationOfferList}>
                    {station.offersTruncated ? (
                      <p className={styles.small}>
                        {isEnglish
                          ? `Showing ${station.offers.length} of ${station.offerCount} public offers. `
                          : `展示 ${station.offerCount} 条公开报价中的前 ${station.offers.length} 条。`}
                        <Link
                          href={`${isEnglish ? "/en" : ""}/api-transit/${station.slug}`}
                        >
                          {isEnglish ? "View full catalogue" : "查看完整价目"}
                        </Link>
                      </p>
                    ) : null}
                    {station.offers.length ? (
                      station.offers.map((offer) => (
                        <div className={styles.stationOffer} key={offer.id}>
                          <div className={styles.stationOfferHeader}>
                            <strong>{offer.standardModelLabel}</strong>
                            <span className={styles.pill}>
                              {billingModeLabel(offer.billingMode, locale)}
                            </span>
                          </div>
                          <p className={styles.rate}>
                            {offerRate(offer, locale)}
                          </p>
                          <p className={styles.rateNote}>
                            {offerPriceNote(offer, locale)}
                          </p>
                          <p className={styles.rateNote}>
                            {availabilityCopy(offer.availability, locale)}
                          </p>
                          <TransitAvailabilityEvidence
                            availability={offer.availability}
                            locale={locale}
                          />
                          {offer.priceSourceUrl ? (
                            <a
                              className={styles.sourceLink}
                              href={offer.priceSourceUrl}
                              target="_blank"
                              rel="nofollow noopener noreferrer"
                            >
                              {isEnglish ? "Open price source" : "打开价格来源"}
                            </a>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className={styles.small}>
                        {isEnglish
                          ? "No public offers for this station."
                          : "该站点暂无公开报价。"}
                      </p>
                    )}
                  </div>

                  <div className={styles.stationMeta}>
                    <a
                      className={styles.sourceLink}
                      href={station.websiteUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                    >
                      {isEnglish ? "Visit station" : "访问站点"}
                    </a>
                    {station.sourceUrl ? (
                      <a
                        className={styles.sourceLink}
                        href={station.sourceUrl}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                      >
                        {isEnglish ? "Open directory source" : "打开目录来源"}
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <strong>
                {isEnglish
                  ? "No public stations match."
                  : "没有符合条件的公开站点。"}
              </strong>
              <p>
                {result.degraded
                  ? statusDescription(result, locale)
                  : isEnglish
                    ? "Try a broader search or reset the filters."
                    : "可以扩大搜索范围或重置筛选。"}
              </p>
            </div>
          )}
          {result.nextCursor ? (
            <Link
              className={styles.next}
              href={transitHref(path, result.query, result.nextCursor)}
            >
              {isEnglish ? "Next page" : "下一页"}
            </Link>
          ) : null}
        </section>

        <p className={styles.footnote}>
          {isEnglish
            ? "A combined coefficient is shown only for token-billed offers. Fixed and per-request prices stay in their original unit. Availability percentages are displayed only when the record includes a non-zero sample count."
            : "综合系数仅用于 Token 计费报价；固定价和按次价格保留原始单位。只有记录包含非零样本数时才展示可用率。"}
        </p>
      </main>
      <SiteFooter
        locale={locale}
        description={
          isEnglish
            ? "An independent, read-only directory of public API transit information with explicit source and sample boundaries."
            : "独立、只读的公开 API 中转信息目录，明确标注来源和样本边界。"
        }
      />
    </div>
  );
}
