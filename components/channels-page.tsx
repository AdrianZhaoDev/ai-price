import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { absoluteUrl, metadataForDocument } from "@/lib/seo";
import {
  getChannelList,
  type ChannelListResult,
} from "@/lib/channels/repository";
import {
  isOfferAvailable,
  type OfferAvailabilityOptions,
} from "@/lib/channels/ranking";
import type {
  ChannelOffer,
  ChannelOfferFilters,
  ChannelDataStatus,
} from "@/lib/channels/types";
import { SiteFooter, SiteHeader } from "./site-header";
import styles from "./public-data-directory.module.css";

export type PublicDirectorySearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const channelAvailabilityValues = [
  "all",
  "in_stock",
  "out_of_stock",
  "unknown",
  "expired",
  "unavailable",
] as const;

const channelSortValues = [
  "price",
  "updated",
  "merchant",
  "product",
  "availability",
  "relevance",
] as const;

function firstValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim();
  return trimmed || undefined;
}

function boundedLimit(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return Math.min(Math.max(parsed, 1), 50);
}

function channelFiltersFromParams(
  params: Record<string, string | string[] | undefined>,
): Partial<ChannelOfferFilters> {
  const query = firstValue(params.q ?? params.search);
  const availabilityValue = firstValue(params.availability ?? params.status);
  const sortValue = firstValue(params.sort);
  const availability = channelAvailabilityValues.includes(
    availabilityValue as (typeof channelAvailabilityValues)[number],
  )
    ? (availabilityValue as ChannelOfferFilters["availability"])
    : undefined;
  const sort = channelSortValues.includes(
    sortValue as (typeof channelSortValues)[number],
  )
    ? (sortValue as ChannelOfferFilters["sort"])
    : undefined;
  const limit = boundedLimit(firstValue(params.limit));
  return {
    ...(query ? { query } : {}),
    ...(availability ? { availability } : {}),
    ...(sort ? { sort } : {}),
    ...(limit ? { limit } : {}),
    publishedOnly: true,
  };
}

function searchValue(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  return firstValue(params[key]) ?? "";
}

function formatDate(value: string | undefined, locale: Locale): string {
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

function formatMinorPrice(
  amountMinor: number | null | undefined,
  currency: string | undefined,
  locale: Locale,
): string {
  if (amountMinor === null || amountMinor === undefined) {
    return locale === "en" ? "Price unavailable" : "暂无可比价格";
  }
  const code = currency ?? "CNY";
  try {
    const localeCode = locale === "en" ? "en-US" : "zh-CN";
    const formatter = new Intl.NumberFormat(localeCode, {
      style: "currency",
      currency: code,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountMinor / 10 ** digits);
  } catch {
    return `${code} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function displaySpecification(
  specification: ChannelOffer["specification"],
  fallback: string,
): string {
  if (typeof specification === "string" && specification.trim()) {
    return specification;
  }
  if (specification && typeof specification === "object") {
    return Object.entries(specification)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(" · ");
  }
  return fallback;
}

function availabilityLabel(
  status: ChannelOffer["availabilityStatus"],
  locale: Locale,
): string {
  if (locale === "en") {
    return {
      in_stock: "In stock",
      out_of_stock: "Out of stock",
      unknown: "Availability unknown",
      expired: "Expired",
      unavailable: "Unavailable",
    }[status];
  }
  return {
    in_stock: "有货",
    out_of_stock: "缺货",
    unknown: "库存未知",
    expired: "已过期",
    unavailable: "不可用",
  }[status];
}

function sourceLabel(
  status: ChannelDataStatus,
  dataSource: ChannelListResult["dataSource"],
  locale: Locale,
): string {
  if (
    status === "synthetic" ||
    dataSource === "synthetic" ||
    dataSource === "synthetic_fixture"
  ) {
    return locale === "en" ? "Synthetic fixture" : "合成演示数据";
  }
  if (status === "degraded") {
    return locale === "en" ? "Verified data unavailable" : "暂无已核验数据";
  }
  if (dataSource === "database") {
    return locale === "en" ? "Published database snapshot" : "已发布数据库快照";
  }
  return locale === "en" ? "Injected public snapshot" : "注入的公开快照";
}

function safeChannelResult(
  result: ChannelListResult | null,
  locale: Locale,
): ChannelListResult {
  if (result) return result;
  return {
    offers: [],
    products: [],
    merchants: [],
    totalOffers: 0,
    generatedAt: new Date().toISOString(),
    dataStatus: "degraded",
    dataSource: "database",
    warning:
      locale === "en"
        ? "The public channels snapshot could not be read."
        : "暂时无法读取公开卡网快照。",
  };
}

function statusTone(result: ChannelListResult): "ok" | "warning" {
  return result.dataStatus === "published" || result.dataStatus === "verified"
    ? "ok"
    : "warning";
}

function channelStructuredData(
  result: ChannelListResult,
  locale: Locale,
  path: string,
) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name:
        locale === "en" ? "Public AI channel offers" : "公开 AI 卡网报价目录",
      description:
        locale === "en"
          ? "A read-only directory of public channel offers with availability and source context."
          : "只读公开卡网报价目录，保留可用性和来源说明。",
      url: absoluteUrl(path),
      inLanguage: locale === "en" ? "en" : "zh-CN",
      isAccessibleForFree: true,
      dateModified: result.generatedAt,
      creator: { "@type": "Organization", name: "Low Price Radar" },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: locale === "en" ? "Channel products" : "卡网产品",
      numberOfItems: result.products.length,
      itemListElement: result.products.slice(0, 50).map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: product.productName,
      })),
    },
  ];
}

export const channelsPageMetadata = (locale: Locale) =>
  metadataForDocument({
    path: "/channels",
    title:
      locale === "en" ? "Public AI Channel Offers" : "公开 AI 卡网报价目录",
    description:
      locale === "en"
        ? "Browse public AI channel offers with source links, availability, deduplicated prices, and an explicit synthetic-data fallback when the public snapshot is not connected."
        : "浏览公开 AI 卡网报价，查看来源、库存、去重后的价格和数据状态；数据库未接通时明确标注合成回退数据。",
    locale,
    keywords:
      locale === "en"
        ? [
            "AI channel prices",
            "public offer directory",
            "AI reseller comparison",
          ]
        : ["AI 卡网价格", "公开报价目录", "AI 渠道比价"],
  });

export async function ChannelsPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: PublicDirectorySearchParams;
}) {
  const params = await searchParams;
  const filters = channelFiltersFromParams(params);
  let result: ChannelListResult | null = null;
  try {
    result = await getChannelList(filters);
  } catch {
    // The repository normally degrades internally. Keep the page available if
    // an injected adapter throws before it can return a fallback snapshot.
  }
  const data = safeChannelResult(result, locale);
  const isEnglish = locale === "en";
  const synthetic =
    data.dataStatus === "synthetic" ||
    data.dataSource === "synthetic" ||
    data.dataSource === "synthetic_fixture";
  const tone = statusTone(data);
  const availableCount = data.products.reduce(
    (count, product) => count + product.availableOfferCount,
    0,
  );
  const path = isEnglish ? "/en/channels" : "/channels";
  const structuredData = channelStructuredData(data, locale, path);
  const visibleProducts = data.products.slice(0, 24);
  const visibleMerchants = data.merchants.slice(0, 12);
  const availabilityNow: OfferAvailabilityOptions = {
    now: new Date(),
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

        <div
          className={styles.subnav}
          aria-label={isEnglish ? "Public directories" : "公开目录导航"}
        >
          <Link
            href={isEnglish ? "/en/channels" : "/channels"}
            aria-current="page"
          >
            {isEnglish ? "Channels" : "卡网报价"}
          </Link>
          <Link href={isEnglish ? "/en/api-transit" : "/api-transit"}>
            {isEnglish ? "API transit" : "API 中转"}
          </Link>
          <Link href={isEnglish ? "/en/api-pricing" : "/api-pricing"}>
            {isEnglish ? "Official API prices" : "官方 API 价格"}
          </Link>
        </div>

        <section className={styles.hero} aria-labelledby="channels-title">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-line" aria-hidden="true" />
              {isEnglish ? "Public directory" : "公开目录"}
            </p>
            <h1 id="channels-title">
              {isEnglish
                ? "Compare public AI channel offers."
                : "比较公开 AI 卡网报价。"}
            </h1>
            <p className={styles.lead}>
              {isEnglish
                ? "Offers are deduplicated by a public key, ranked with availability first, and kept separate from official provider pricing."
                : "报价按公开去重键合并，优先展示可用项，并与官方 Provider 价格目录保持边界。"}
            </p>
          </div>
          <div className={styles.heroAside}>
            <p>
              {isEnglish
                ? "Read-only comparison. A listing is not an endorsement or a guarantee of fulfilment."
                : "只读比价页面。收录不代表推荐，也不保证履约。"}
            </p>
            <p>
              {isEnglish ? "Snapshot time" : "快照时间"}:{" "}
              {formatDate(data.generatedAt, locale)}
            </p>
          </div>
        </section>

        <div
          className={styles.status}
          data-tone={tone}
          role="status"
          aria-live="polite"
        >
          <span className={styles.statusMark} aria-hidden="true" />
          <div>
            <strong>
              {sourceLabel(data.dataStatus, data.dataSource, locale)}
            </strong>
            <p>
              {data.warning ??
                (synthetic
                  ? isEnglish
                    ? "These rows are deterministic development examples, not live merchant checks."
                    : "这些记录是确定性的开发示例，不是实时商户核验。"
                  : isEnglish
                    ? "Only published rows are shown by default."
                    : "默认仅展示已发布记录。")}
            </p>
          </div>
        </div>

        <section
          className={styles.stats}
          aria-label={isEnglish ? "Directory summary" : "目录概览"}
        >
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Products" : "产品"}
            </span>
            <strong className={styles.statValue}>{data.products.length}</strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Offers" : "报价"}
            </span>
            <strong className={styles.statValue}>{data.totalOffers}</strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Available" : "可用报价"}
            </span>
            <strong className={styles.statValue}>{availableCount}</strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>
              {isEnglish ? "Merchants" : "商户"}
            </span>
            <strong className={styles.statValue}>
              {data.merchants.length}
            </strong>
          </div>
        </section>

        <form className={styles.toolbar} method="get" action={path}>
          <div className={styles.field}>
            <label htmlFor="channel-query">
              {isEnglish ? "Search" : "搜索"}
            </label>
            <input
              id="channel-query"
              name="q"
              type="search"
              defaultValue={
                searchValue(params, "q") || searchValue(params, "search")
              }
              placeholder={
                isEnglish ? "Product, merchant, platform" : "产品、商户或平台"
              }
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="channel-availability">
              {isEnglish ? "Availability" : "可用性"}
            </label>
            <select
              id="channel-availability"
              name="availability"
              defaultValue={searchValue(params, "availability") || "all"}
            >
              <option value="all">{isEnglish ? "All" : "全部"}</option>
              <option value="in_stock">
                {isEnglish ? "In stock" : "有货"}
              </option>
              <option value="out_of_stock">
                {isEnglish ? "Out of stock" : "缺货"}
              </option>
              <option value="unknown">{isEnglish ? "Unknown" : "未知"}</option>
              <option value="expired">
                {isEnglish ? "Expired" : "已过期"}
              </option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="channel-sort">{isEnglish ? "Sort" : "排序"}</label>
            <select
              id="channel-sort"
              name="sort"
              defaultValue={searchValue(params, "sort") || "price"}
            >
              <option value="price">
                {isEnglish ? "Availability + price" : "可用性 + 价格"}
              </option>
              <option value="updated">
                {isEnglish ? "Recently observed" : "最近观测"}
              </option>
              <option value="merchant">
                {isEnglish ? "Merchant" : "商户"}
              </option>
              <option value="product">{isEnglish ? "Product" : "产品"}</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="channel-limit">{isEnglish ? "Rows" : "条数"}</label>
            <select
              id="channel-limit"
              name="limit"
              defaultValue={searchValue(params, "limit") || "20"}
            >
              {[10, 20, 35, 50].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <button className={styles.button} type="submit">
            {isEnglish ? "Apply" : "应用筛选"}
          </button>
          <Link className={styles.reset} href={path}>
            {isEnglish ? "Reset" : "重置"}
          </Link>
        </form>

        <section aria-labelledby="channel-products-title">
          <div className={styles.sectionHeader}>
            <h2 id="channel-products-title">
              {isEnglish ? "Products" : "产品"}
            </h2>
            <p>
              {visibleProducts.length < data.products.length
                ? isEnglish
                  ? `Showing ${visibleProducts.length} of ${data.products.length}`
                  : `显示 ${visibleProducts.length} / ${data.products.length}`
                : isEnglish
                  ? `${data.products.length} matched`
                  : `匹配 ${data.products.length} 个`}
            </p>
          </div>
          {visibleProducts.length ? (
            <div className={styles.productGrid}>
              {visibleProducts.map((product) => {
                const lowest = product.lowestAvailableOffer;
                return (
                  <article
                    className={styles.productCard}
                    key={product.productId}
                  >
                    <h3>{product.productName}</h3>
                    <div className={styles.productMeta}>
                      {product.platform ? (
                        <span className={styles.pill}>{product.platform}</span>
                      ) : null}
                      {product.productType ? (
                        <span className={styles.pill}>
                          {product.productType}
                        </span>
                      ) : null}
                      <span
                        className={styles.pill}
                        data-tone={
                          product.availableOfferCount ? "positive" : "warning"
                        }
                      >
                        {product.availableOfferCount}{" "}
                        {isEnglish ? "available" : "可用"}
                      </span>
                    </div>
                    <span className={styles.price}>
                      {formatMinorPrice(
                        product.lowestPriceMinor,
                        product.lowestCurrency,
                        locale,
                      )}
                    </span>
                    <p className={styles.small}>
                      {product.offerCount}{" "}
                      {isEnglish ? "deduplicated offers" : "条去重报价"} ·{" "}
                      {product.merchantCount}{" "}
                      {isEnglish ? "merchants" : "个商户"}
                    </p>
                    {lowest ? (
                      <a
                        className={styles.productLink}
                        href={lowest.offerUrl}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                      >
                        {isEnglish
                          ? "Open lowest available source"
                          : "打开最低可用来源"}
                      </a>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              <strong>
                {isEnglish
                  ? "No published products match."
                  : "没有符合条件的已发布产品。"}
              </strong>
              <p>
                {isEnglish
                  ? "Try a broader search or reset the filters."
                  : "可以扩大搜索范围或重置筛选。"}
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby="channel-merchants-title">
          <div className={styles.sectionHeader}>
            <h2 id="channel-merchants-title">
              {isEnglish ? "Merchants" : "商户"}
            </h2>
            <p>
              {isEnglish
                ? "Availability and ranking hits, not endorsements"
                : "可用性与排名命中，不代表推荐"}
            </p>
          </div>
          {visibleMerchants.length ? (
            <div className={styles.productGrid}>
              {visibleMerchants.map((merchant) => (
                <article
                  className={styles.productCard}
                  key={merchant.merchantId}
                >
                  <h3>{merchant.merchantName}</h3>
                  <p className={styles.small}>
                    {merchant.productCount} {isEnglish ? "products" : "个产品"}{" "}
                    · {merchant.availableOfferCount}/{merchant.offerCount}{" "}
                    {isEnglish ? "available offers" : "条可用报价"}
                  </p>
                  <div className={styles.productMeta}>
                    <span
                      className={styles.pill}
                      data-tone={
                        merchant.lowestPriceHits ? "positive" : undefined
                      }
                    >
                      {merchant.lowestPriceHits}{" "}
                      {isEnglish ? "lowest-price hits" : "次最低价"}
                    </span>
                    <span className={styles.pill}>
                      {merchant.topFiveHits}{" "}
                      {isEnglish ? "top-five hits" : "次前五"}
                    </span>
                  </div>
                  <p className={styles.small}>
                    {isEnglish ? "Last observed" : "最近观测"}:{" "}
                    {formatDate(merchant.lastSeenAt, locale)}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section aria-labelledby="channel-offers-title">
          <div className={styles.sectionHeader}>
            <h2 id="channel-offers-title">
              {isEnglish ? "Offers" : "报价明细"}
            </h2>
            <p>
              {isEnglish
                ? "Source links open in a new tab"
                : "来源链接将在新标签页打开"}
            </p>
          </div>
          {data.offers.length ? (
            <ul className={styles.offerList}>
              {data.offers.map((offer) => {
                const available = isOfferAvailable(offer, availabilityNow);
                return (
                  <li className={styles.offerCard} key={offer.id}>
                    <div className={styles.offerTitle}>
                      <strong>{offer.productName}</strong>
                      <span>
                        {offer.merchantName} ·{" "}
                        {displaySpecification(
                          offer.specification,
                          offer.rawTitle,
                        )}
                      </span>
                    </div>
                    <div className={styles.offerPrice}>
                      <strong>
                        {formatMinorPrice(
                          offer.priceMinor,
                          offer.currency,
                          locale,
                        )}
                      </strong>
                      <span>{formatDate(offer.lastSeenAt, locale)}</span>
                    </div>
                    <span
                      className={styles.pill}
                      data-tone={available ? "positive" : "warning"}
                    >
                      {availabilityLabel(offer.availabilityStatus, locale)}
                    </span>
                    <a
                      className={styles.sourceLink}
                      href={offer.offerUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      aria-label={`${isEnglish ? "Open source for" : "打开来源"} ${offer.productName}`}
                    >
                      {isEnglish ? "Open source" : "打开来源"}
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>
              <strong>
                {isEnglish
                  ? "No offers are available in this view."
                  : "当前视图没有可展示的报价。"}
              </strong>
              <p>
                {data.warning ??
                  (isEnglish
                    ? "Published data may be delayed."
                    : "已发布数据可能尚未同步。")}
              </p>
            </div>
          )}
        </section>

        <p className={styles.footnote}>
          {isEnglish
            ? "Prices are stored in source currency minor units and are not converted across currencies here. Availability is a point-in-time signal; confirm terms, account safety, and final price on the source page."
            : "价格保留来源币种的最小单位，本页不跨币种换算。可用性只是某一时点的信号；请在来源页面确认条款、账号安全和最终价格。"}
        </p>
      </main>
      <SiteFooter
        locale={locale}
        description={
          isEnglish
            ? "Public channel offers are kept separate from official provider pricing and clearly labeled when synthetic or degraded."
            : "公开卡网报价与官方 Provider 价格分开，并明确标注合成或降级状态。"
        }
      />
    </div>
  );
}
