import { ProviderMark } from "@/components/icons/provider-mark";
import { StructuredData } from "@/components/structured-data";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  apiModelsForLandingPage,
  offersForLandingPage,
  type ComparablePriceGroup,
  type LandingPageData,
} from "@/lib/landing-page-data";
import { absoluteUrl, modeSeo, SITE_NAME, SITE_POSITIONING } from "@/lib/seo";
import {
  formatCny,
  formatOfferPrice,
  formatPeriod,
} from "@/lib/pricing/format";
import type { PriceOffer, ProviderCatalogItem } from "@/lib/pricing/types";
import { landingPageBySlug, relatedLandingPages } from "@/lib/landing-pages";
import { ArrowUpRight, Clock3, Database, Globe2 } from "lucide-react";
import Link from "next/link";

function formatCheckedAt(value?: string): string {
  if (!value) return "等待首次采集";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function freshnessLabel(data: LandingPageData): string {
  const labels = {
    fresh: "数据新鲜",
    delayed: "更新稍有延迟",
    stale: "数据可能过期",
    unknown: "等待首次核验",
  } as const;
  return labels[data.quality.freshness];
}

function priceTypeLabel(priceType?: string): string {
  if (priceType === "cached_input") return "缓存输入";
  if (priceType === "input") return "输入";
  if (priceType === "output") return "输出";
  if (priceType === "cache_write") return "缓存写入";
  return "其他计费";
}

function groupConclusion(
  group: ComparablePriceGroup,
  current: boolean,
): string {
  if (group.regionCount < 3 || !group.minimum || !group.maximum) {
    return `${group.label} 当前收录 ${group.regionCount} 个地区，暂不足以生成稳定的地区价差结论。`;
  }
  const prefix = current ? "当前" : "最近一次有效核验中，";
  return `${prefix}${group.label} 覆盖 ${group.regionCount} 个地区，最低为 ${group.minimum.regionName ?? group.minimum.regionCode ?? "已收录地区"} ${formatCny(group.minimum.convertedCny)}，最高为 ${group.maximum.regionName ?? group.maximum.regionCode ?? "已收录地区"} ${formatCny(group.maximum.convertedCny)}，价差约 ${group.spreadPercent?.toFixed(1) ?? "—"}%。`;
}

function pageConclusion(data: LandingPageData): string {
  const { page, quality, summary } = data;
  const current = quality.freshness !== "stale";
  if (page.type === "global") {
    const comparable = summary.subscriptionGroups.find(
      (group) => group.regionCount >= 3,
    );
    if (comparable) return groupConclusion(comparable, current);
    return `${page.name} 当前收录 ${summary.offerCount} 条官方报价，但同一套餐变体尚不足 3 个地区，因此不跨套餐生成最低价。`;
  }
  const parts: string[] = [];
  if (summary.subscriptionGroups.length > 0) {
    parts.push(
      `已收录 ${summary.subscriptionGroups.length} 个有效订阅套餐或计费周期`,
    );
  }
  if (summary.modelCount > 0) {
    parts.push(`API 部分覆盖 ${summary.modelCount} 个具有稳定标识的模型`);
  }
  if (summary.tokenHighlights.length > 0) {
    const metrics = summary.tokenHighlights
      .map(
        (item) =>
          `${priceTypeLabel(item.priceType)}最低参考为 ${item.modelName} ${item.offer.displayPrice}${item.offer.unit ?? ""}`,
      )
      .join("；");
    parts.push(metrics);
  }
  if (parts.length === 0) {
    return `${page.name} 暂无达到公开展示门槛的有效价格，页面会在官方数据恢复后自动更新。`;
  }
  const prefix = current
    ? ""
    : "数据已超过 24 小时未核验，以下为最近一次有效记录：";
  return `${prefix}${parts.join("；")}。不同计价单位分别展示，不混入 Token 单价排行。`;
}

function sourceFor(provider: ProviderCatalogItem): string {
  return provider.sourceUrl;
}

function offerValue(offer: PriceOffer): string {
  if (offer.amountMinor === null) return offer.displayPrice;
  return formatOfferPrice(offer);
}

function sourceLabel(provider: ProviderCatalogItem): string {
  return provider.sourceLabel || "官方来源";
}

function providerLastChecked(
  providers: ProviderCatalogItem[],
): string | undefined {
  return providers
    .map((provider) => provider.lastCheckedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function ctaLinks(data: LandingPageData): Array<{
  href: string;
  label: string;
  description: string;
  primary?: boolean;
}> {
  const { page } = data;
  if (page.type === "global") {
    const providerId = page.providerIds.global?.[0];
    if (!providerId) return [];
    const plan = page.planIds?.[0];
    const query = new URLSearchParams({ provider: providerId });
    if (plan) query.set("plan", plan);
    return [
      {
        href: `/?${query.toString()}`,
        label: "打开全球地区价格表",
        description: "查看完整地区、原币价格与人民币参考价",
        primary: true,
      },
    ];
  }

  const links: Array<{
    href: string;
    label: string;
    description: string;
    primary?: boolean;
  }> = [];
  const subscriptionProvider = page.providerIds["china-subscription"]?.[0];
  const apiProvider = page.providerIds.api?.[0];
  if (subscriptionProvider) {
    links.push({
      href: `/china-ai-subscriptions?provider=${encodeURIComponent(subscriptionProvider)}`,
      label: `比较 ${page.name} 的订阅价格`,
      description: "查看同类套餐、计费周期与官方价格",
      primary: !apiProvider,
    });
  }
  if (apiProvider) {
    links.push({
      href: `/api-pricing?provider=${encodeURIComponent(apiProvider)}`,
      label: `查看 ${page.name} API 价格排行`,
      description: "比较缓存输入、输入与输出单价",
      primary: true,
    });
  }
  return links;
}

function PriceRows({
  provider,
  offers,
  api = false,
}: {
  provider: ProviderCatalogItem;
  offers: PriceOffer[];
  api?: boolean;
}) {
  if (offers.length === 0) {
    return (
      <p className="landing-empty">
        {api ? "暂无已核验的统一 API 价格。" : "暂无已核验的公开订阅价格。"}
      </p>
    );
  }

  return (
    <div
      className="landing-price-table"
      role="table"
      aria-label={`${provider.name}官方价格`}
    >
      <div className="landing-price-header" role="row">
        <span role="columnheader">方案 / 模型</span>
        <span role="columnheader">官方价格</span>
        <span role="columnheader">人民币参考 / 单位</span>
        <span role="columnheader">来源</span>
      </div>
      {offers.map((offer) => (
        <div className="landing-price-row" role="row" key={offer.id}>
          <span role="cell">
            <strong>{offer.modelName ?? offer.planName}</strong>
            <small>
              {offer.modelName && offer.planName !== offer.modelName
                ? offer.planName
                : (offer.category ?? provider.description)}
            </small>
          </span>
          <span role="cell" className="landing-official-price">
            <strong>{offerValue(offer)}</strong>
            {offer.currency ? <small>{offer.currency}</small> : null}
          </span>
          <span role="cell">
            {api ? (offer.unit ?? "按官方单位") : formatCny(offer.convertedCny)}
            {!api && offer.billingPeriod !== "usage" ? (
              <small>{formatPeriod(offer.billingPeriod)}</small>
            ) : null}
          </span>
          <a
            role="cell"
            className="landing-source-link"
            href={offer.sourceUrl ?? sourceFor(provider)}
            target="_blank"
            rel="noreferrer"
          >
            <span>{sourceLabel(provider)}</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      ))}
    </div>
  );
}

function ProviderSection({
  provider,
  offers,
  api = false,
}: {
  provider: ProviderCatalogItem;
  offers: PriceOffer[];
  api?: boolean;
}) {
  return (
    <section
      className="landing-data-section"
      aria-labelledby={`${provider.id}-title`}
    >
      <div className="landing-section-heading">
        <div className="landing-provider-title">
          <span
            className="landing-provider-mark"
            style={
              { "--provider-color": provider.color } as React.CSSProperties
            }
          >
            <ProviderMark
              providerId={provider.id}
              color={provider.color}
              size={28}
            />
          </span>
          <div>
            <p className="landing-kicker">
              {api ? "官方 API 价格" : "官方订阅价格"}
            </p>
            <h2 id={`${provider.id}-title`}>{provider.name}</h2>
          </div>
        </div>
        <a
          className="landing-inline-link"
          href={provider.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          官方来源 <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
      <p className="landing-section-description">{provider.description}</p>
      <PriceRows provider={provider} offers={offers} api={api} />
    </section>
  );
}

function CtaBlock({
  links,
  compact = false,
}: {
  links: ReturnType<typeof ctaLinks>;
  compact?: boolean;
}) {
  if (links.length === 0) return null;
  return (
    <section className={`landing-cta ${compact ? "landing-cta-compact" : ""}`}>
      <div>
        <p className="landing-kicker">下一步</p>
        <h2>想看它和其他产品的价格差距？</h2>
      </div>
      <div className="landing-cta-links">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`landing-cta-link ${link.primary ? "landing-cta-link-primary" : ""}`}
          >
            <span>
              <strong>{link.label}</strong>
              <small>{link.description}</small>
            </span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function LandingSummary({ data }: { data: LandingPageData }) {
  const comparableGroups = data.summary.subscriptionGroups.filter(
    (group) => group.regionCount > 0,
  );
  return (
    <section
      className="landing-summary"
      aria-labelledby="landing-summary-title"
    >
      <div className="landing-summary-copy">
        <p className="landing-kicker">价格结论</p>
        <h2 id="landing-summary-title">先看这组数据说明了什么</h2>
        <p>{pageConclusion(data)}</p>
      </div>
      <dl className="landing-summary-stats">
        <div>
          <dt>有效报价</dt>
          <dd>{data.summary.offerCount}</dd>
        </div>
        <div>
          <dt>{data.page.type === "global" ? "覆盖地区" : "稳定模型"}</dt>
          <dd>
            {data.page.type === "global"
              ? data.summary.regionCount
              : data.summary.modelCount}
          </dd>
        </div>
        <div>
          <dt>数据状态</dt>
          <dd data-freshness={data.quality.freshness}>
            {freshnessLabel(data)}
          </dd>
        </div>
      </dl>
      {comparableGroups.length > 0 ? (
        <div className="landing-group-notes">
          {comparableGroups.map((group) => (
            <p key={group.key}>{groupConclusion(group, false)}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RelatedPricePages({ data }: { data: LandingPageData }) {
  const related = relatedLandingPages(data.page);
  if (related.length === 0) return null;
  return (
    <nav className="landing-related" aria-label="相关价格页面">
      <div>
        <p className="landing-kicker">继续比较</p>
        <h2>相关价格页面</h2>
      </div>
      <div className="landing-related-links">
        {related.map((page) => (
          <Link key={page.slug} href={`/${page.slug}`}>
            <span>{page.heading}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </nav>
  );
}

export async function LandingPage({ data }: { data: LandingPageData }) {
  const { page } = data;
  const providers =
    page.type === "global"
      ? data.globalProviders
      : [...data.subscriptionProviders, ...data.apiProviders];
  const links = ctaLinks(data);
  const modelRows = apiModelsForLandingPage(data.apiProviders);
  const checkedAt =
    data.quality.lastCheckedAt ?? providerLastChecked(providers);
  const visibleGlobalOffers = data.globalProviders.flatMap((provider) =>
    offersForLandingPage(page, provider),
  );
  const parent = page.parentSlug
    ? landingPageBySlug.get(page.parentSlug)
    : undefined;
  const breadcrumbItems = [
    {
      "@type": "ListItem",
      position: 1,
      name: SITE_NAME,
      item: absoluteUrl("/"),
    },
    ...(parent
      ? [
          {
            "@type": "ListItem",
            position: 2,
            name: parent.name,
            item: absoluteUrl(`/${parent.slug}`),
          },
        ]
      : []),
    {
      "@type": "ListItem",
      position: parent ? 3 : 2,
      name: page.name,
      item: absoluteUrl(`/${page.slug}`),
    },
  ];
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: page.title,
      description: page.description,
      url: absoluteUrl(`/${page.slug}`),
      inLanguage: "zh-CN",
      dateModified: data.quality.pageModifiedAt,
      keywords: page.aliases,
      creator: {
        "@type": "Organization",
        "@id": `${absoluteUrl("/")}#organization`,
        name: SITE_NAME,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems,
    },
  ];

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="landing-shell">
        <a className="skip-link" href="#main-content">
          跳至主要内容
        </a>
        <header className="site-header landing-header">
          <Link href="/" className="brand" aria-label={`${SITE_NAME}首页`}>
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="brand-copy">
              <strong>{SITE_NAME}</strong>
              <small>{SITE_POSITIONING}</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="价格模式">
            <Link href={modeSeo.global.path} className="nav-item pressable">
              全球区价
            </Link>
            <Link
              href={modeSeo["china-subscription"].path}
              className="nav-item pressable"
            >
              国内订阅
            </Link>
            <Link href={modeSeo.api.path} className="nav-item pressable">
              API 价格排行榜
            </Link>
          </nav>
          <div className="header-actions">
            <div className="sync-state" title="价格与汇率通常每 4 小时同轮核验">
              <span className="sync-dot" />每 4 小时
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main id="main-content" className="landing-main">
          <nav className="landing-breadcrumbs" aria-label="面包屑">
            <Link href="/">{SITE_NAME}</Link>
            <span aria-hidden="true">/</span>
            {parent ? (
              <>
                <Link href={`/${parent.slug}`}>{parent.name}</Link>
                <span aria-hidden="true">/</span>
              </>
            ) : null}
            <span>{page.name}</span>
          </nav>
          <section className="landing-hero" aria-labelledby="landing-title">
            <div className="landing-hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" />
                官方价格索引
              </p>
              <h1 id="landing-title">{page.heading}</h1>
              <p className="landing-hero-intro">{page.intro}</p>
              <div className="landing-meta-line">
                <span>
                  <Clock3 size={15} aria-hidden="true" />
                  最近核验 {formatCheckedAt(checkedAt)}
                </span>
                <span>
                  {page.type === "global" ? (
                    <Globe2 size={15} aria-hidden="true" />
                  ) : (
                    <Database size={15} aria-hidden="true" />
                  )}
                  {providers.length} 个官方来源
                </span>
                <span data-freshness={data.quality.freshness}>
                  {freshnessLabel(data)}
                </span>
              </div>
            </div>
            <div className="landing-hero-action">
              <p className="landing-aliases">
                相关名称：{page.aliases.join("、")}
              </p>
              <CtaBlock links={links} />
            </div>
          </section>

          <LandingSummary data={data} />

          <div className="landing-data-stack">
            {page.type === "global"
              ? data.globalProviders.map((provider) => (
                  <ProviderSection
                    key={provider.id}
                    provider={provider}
                    offers={visibleGlobalOffers.filter((offer) =>
                      provider.offers.some(
                        (candidate) => candidate.id === offer.id,
                      ),
                    )}
                  />
                ))
              : null}
            {data.subscriptionProviders.map((provider) => (
              <ProviderSection
                key={provider.id}
                provider={provider}
                offers={offersForLandingPage(page, provider)}
              />
            ))}
            {data.apiProviders.map((provider) => (
              <ProviderSection
                key={provider.id}
                provider={provider}
                api
                offers={provider.offers
                  .filter(
                    (offer) =>
                      offer.amountMinor !== null &&
                      offer.status !== "pending" &&
                      offer.status !== "unpublished",
                  )
                  .slice(0, 12)}
              />
            ))}
          </div>

          {data.apiProviders.length > 0 ? (
            <section
              className="landing-model-index"
              aria-labelledby="model-index-title"
            >
              <div className="landing-section-heading">
                <div>
                  <p className="landing-kicker">模型索引</p>
                  <h2 id="model-index-title">按模型查看 API 价格</h2>
                </div>
                <span className="landing-count">
                  {modelRows.length} 个稳定模型
                </span>
              </div>
              <p className="landing-section-description">
                模型名称和官方价格来自可追溯的 API
                价目表；点击模型可在排行榜中查看完整计费项。
              </p>
              {modelRows.length > 0 ? (
                <div className="landing-model-list">
                  {modelRows.map((model) => (
                    <Link
                      key={`${model.providerId}-${model.slug}`}
                      href={`/api-pricing?provider=${encodeURIComponent(model.providerId)}&model=${encodeURIComponent(model.slug)}`}
                      className="landing-model-link"
                    >
                      <span>
                        <strong>{model.name}</strong>
                        <small>{model.providerLabel}</small>
                      </span>
                      <span className="landing-model-prices">
                        {model.offers.slice(0, 3).map((offer) => (
                          <small key={offer.id}>
                            {offer.priceType === "cached_input"
                              ? "缓存"
                              : offer.priceType === "output"
                                ? "输出"
                                : "输入"}{" "}
                            {offer.displayPrice}
                            {offer.unit ? ` ${offer.unit}` : ""}
                          </small>
                        ))}
                      </span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="landing-empty">
                  当前数据尚未提供稳定的模型标识，完整价格请查看 API 排行榜。
                </p>
              )}
            </section>
          ) : null}

          <RelatedPricePages data={data} />
          <CtaBlock links={links} compact />
        </main>

        <footer className="site-footer landing-footer">
          <div>
            <strong>{SITE_NAME}</strong>
            <p>{SITE_POSITIONING} · 看清官方价格，再决定如何订阅或调用。</p>
          </div>
          <div className="footer-links">
            <Link href="/methodology">采集方法</Link>
            <Link href="/privacy">隐私</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
