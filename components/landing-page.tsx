import { ProviderMark } from "@/components/icons/provider-mark";
import { StructuredData } from "@/components/structured-data";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import {
  apiModelsForLandingPage,
  offersForLandingPage,
  type ComparablePriceGroup,
  type LandingPageData,
} from "@/lib/landing-page-data";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import {
  formatCny,
  formatOfferPrice,
  formatPeriod,
} from "@/lib/pricing/format";
import type { PriceOffer, ProviderCatalogItem } from "@/lib/pricing/types";
import {
  landingCopy,
  landingPageBySlug,
  landingPagePath,
  relatedLandingPages,
} from "@/lib/landing-pages";
import { getMessages, type Locale } from "@/lib/i18n";
import { ArrowUpRight, Clock3, Database, Globe2 } from "lucide-react";
import Link from "next/link";

function formatCheckedAt(value: string | undefined, locale: Locale): string {
  if (!value) return getMessages(locale).landing.initialCollection;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function freshnessLabel(data: LandingPageData, locale: Locale): string {
  return getMessages(locale).landing.status[data.quality.freshness];
}

function priceTypeLabel(priceType: string | undefined, locale: Locale): string {
  return getMessages(locale).landing.priceType[priceType ?? "other"];
}

function groupConclusion(
  group: ComparablePriceGroup,
  current: boolean,
  locale: Locale,
): string {
  const messages = getMessages(locale).landing;
  if (group.regionCount < 3 || !group.minimum || !group.maximum) {
    return messages.insufficientRegionConclusion(
      group.label,
      group.regionCount,
    );
  }
  return messages.regionConclusion({
    prefix: current ? messages.current : messages.recentVerified,
    label: group.label,
    regionCount: group.regionCount,
    minimumRegion:
      group.minimum.regionName ??
      group.minimum.regionCode ??
      messages.unknownRegion,
    minimumPrice: formatCny(group.minimum.convertedCny, locale),
    maximumRegion:
      group.maximum.regionName ??
      group.maximum.regionCode ??
      messages.unknownRegion,
    maximumPrice: formatCny(group.maximum.convertedCny, locale),
    spread: group.spreadPercent?.toFixed(1) ?? "—",
  });
}

function pageConclusion(data: LandingPageData, locale: Locale): string {
  const messages = getMessages(locale).landing;
  const { page, quality, summary } = data;
  const current = quality.freshness !== "stale";
  if (page.type === "global") {
    const comparable = summary.subscriptionGroups.find(
      (group) => group.regionCount >= 3,
    );
    if (comparable) return groupConclusion(comparable, current, locale);
    return messages.summaryNoStablePlan(page.name, summary.offerCount);
  }
  const parts: string[] = [];
  if (summary.subscriptionGroups.length > 0) {
    parts.push(messages.summarySubscription(summary.subscriptionGroups.length));
  }
  if (summary.modelCount > 0) {
    parts.push(messages.summaryApiModels(summary.modelCount));
  }
  if (summary.tokenHighlights.length > 0) {
    const metrics = summary.tokenHighlights
      .map(
        (item) =>
          `${priceTypeLabel(item.priceType, locale)}${locale === "en" ? " minimum reference is " : "最低参考为 "}${item.modelName} ${item.offer.displayPrice}${item.offer.unit ?? ""}`,
      )
      .join("；");
    parts.push(metrics);
  }
  if (parts.length === 0) {
    return messages.summaryNoOffers(page.name);
  }
  const prefix = current ? "" : messages.summaryStale;
  return `${prefix}${parts.join(locale === "en" ? "; " : "；")}${locale === "en" ? ". " : "。"}${messages.summaryUnitNote}`;
}

function sourceFor(provider: ProviderCatalogItem): string {
  return provider.sourceUrl;
}

function offerValue(offer: PriceOffer, locale: Locale): string {
  if (offer.amountMinor === null) return offer.displayPrice;
  return formatOfferPrice(offer, locale);
}

function sourceLabel(provider: ProviderCatalogItem, locale: Locale): string {
  return provider.sourceLabel || getMessages(locale).common.officialSource;
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

function ctaLinks(
  data: LandingPageData,
  locale: Locale,
): Array<{
  href: string;
  label: string;
  description: string;
  primary?: boolean;
}> {
  const messages = getMessages(locale).landing;
  const { page } = data;
  if (page.type === "global") {
    const providerId = page.providerIds.global?.[0];
    if (!providerId) return [];
    const plan = page.planIds?.[0];
    const query = new URLSearchParams({ provider: providerId });
    if (plan) query.set("plan", plan);
    return [
      {
        href: `${locale === "en" ? "/en" : "/"}?${query.toString()}`,
        label: messages.openGlobalPriceTable,
        description: messages.openGlobalPriceTableDescription,
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
      href: `${locale === "en" ? "/en/china-ai-subscriptions" : "/china-ai-subscriptions"}?provider=${encodeURIComponent(subscriptionProvider)}`,
      label: messages.compareSubscription(page.name),
      description: messages.compareSubscriptionDescription,
      primary: !apiProvider,
    });
  }
  if (apiProvider) {
    links.push({
      href: `${locale === "en" ? "/en/api-pricing" : "/api-pricing"}?provider=${encodeURIComponent(apiProvider)}`,
      label: messages.compareApi(page.name),
      description: messages.compareApiDescription,
      primary: true,
    });
  }
  return links;
}

function PriceRows({
  provider,
  offers,
  api = false,
  locale,
}: {
  provider: ProviderCatalogItem;
  offers: PriceOffer[];
  api?: boolean;
  locale: Locale;
}) {
  const messages = getMessages(locale).landing;
  if (offers.length === 0) {
    return (
      <p className="landing-empty">
        {api
          ? messages.noVerifiedApiPrices
          : messages.noVerifiedSubscriptionPrices}
      </p>
    );
  }

  return (
    <div
      className="landing-price-table"
      role="table"
      aria-label={messages.officialPriceTable(provider.name)}
    >
      <div className="landing-price-header" role="row">
        <span role="columnheader">{messages.modelOrPlan}</span>
        <span role="columnheader">{messages.providerOfficialPrice}</span>
        <span role="columnheader">{messages.cnyOrUnit}</span>
        <span role="columnheader">
          {getMessages(locale).common.officialSource}
        </span>
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
            <strong>{offerValue(offer, locale)}</strong>
            {offer.currency ? <small>{offer.currency}</small> : null}
          </span>
          <span role="cell">
            {api
              ? (offer.unit ?? getMessages(locale).pricing.perOfficialUnit)
              : formatCny(offer.convertedCny, locale)}
            {!api && offer.billingPeriod !== "usage" ? (
              <small>{formatPeriod(offer.billingPeriod, locale)}</small>
            ) : null}
          </span>
          <a
            role="cell"
            className="landing-source-link"
            href={offer.sourceUrl ?? sourceFor(provider)}
            target="_blank"
            rel="noreferrer"
          >
            <span>{sourceLabel(provider, locale)}</span>
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
  locale,
}: {
  provider: ProviderCatalogItem;
  offers: PriceOffer[];
  api?: boolean;
  locale: Locale;
}) {
  const messages = getMessages(locale);
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
              {api
                ? messages.landing.officialApiPrice
                : messages.landing.officialSubscriptionPrice}
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
          {messages.common.officialSource}{" "}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
      <p className="landing-section-description">{provider.description}</p>
      <PriceRows
        provider={provider}
        offers={offers}
        api={api}
        locale={locale}
      />
    </section>
  );
}

function CtaBlock({
  links,
  compact = false,
  locale,
}: {
  links: ReturnType<typeof ctaLinks>;
  compact?: boolean;
  locale: Locale;
}) {
  const messages = getMessages(locale).landing;
  if (links.length === 0) return null;
  return (
    <section className={`landing-cta ${compact ? "landing-cta-compact" : ""}`}>
      <div>
        <p className="landing-kicker">{messages.nextStep}</p>
        <h2>{messages.continueComparing}</h2>
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

function LandingSummary({
  data,
  locale,
}: {
  data: LandingPageData;
  locale: Locale;
}) {
  const messages = getMessages(locale).landing;
  const comparableGroups = data.summary.subscriptionGroups.filter(
    (group) => group.regionCount > 0,
  );
  return (
    <section
      className="landing-summary"
      aria-labelledby="landing-summary-title"
    >
      <div className="landing-summary-copy">
        <p className="landing-kicker">{messages.priceConclusion}</p>
        <h2 id="landing-summary-title">{messages.conclusionTitle}</h2>
        <p>{pageConclusion(data, locale)}</p>
      </div>
      <dl className="landing-summary-stats">
        <div>
          <dt>{messages.validOffers}</dt>
          <dd>{data.summary.offerCount}</dd>
        </div>
        <div>
          <dt>
            {data.page.type === "global"
              ? messages.coveredRegions
              : messages.stableModels}
          </dt>
          <dd>
            {data.page.type === "global"
              ? data.summary.regionCount
              : data.summary.modelCount}
          </dd>
        </div>
        <div>
          <dt>{messages.dataStatus}</dt>
          <dd data-freshness={data.quality.freshness}>
            {freshnessLabel(data, locale)}
          </dd>
        </div>
      </dl>
      {comparableGroups.length > 0 ? (
        <div className="landing-group-notes">
          {comparableGroups.map((group) => (
            <p key={group.key}>{groupConclusion(group, false, locale)}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RelatedPricePages({
  data,
  locale,
}: {
  data: LandingPageData;
  locale: Locale;
}) {
  const messages = getMessages(locale).landing;
  const related = relatedLandingPages(data.page);
  if (related.length === 0) return null;
  return (
    <nav className="landing-related" aria-label={messages.relatedPages}>
      <div>
        <p className="landing-kicker">{messages.continueComparing}</p>
        <h2>{messages.relatedPages}</h2>
      </div>
      <div className="landing-related-links">
        {related.map((page) => (
          <Link
            key={page.slug}
            href={landingPagePath(page, locale)}
            prefetch={false}
          >
            <span>{landingCopy(page, locale).heading}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </nav>
  );
}

export async function LandingPage({
  data,
  locale = "zh-CN",
}: {
  data: LandingPageData;
  locale?: Locale;
}) {
  const { page } = data;
  const messages = getMessages(locale);
  const copy = landingCopy(page, locale);
  const providers =
    page.type === "global"
      ? data.globalProviders
      : [...data.subscriptionProviders, ...data.apiProviders];
  const links = ctaLinks(data, locale);
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
      item: absoluteUrl(locale === "en" ? "/en" : "/"),
    },
    ...(parent
      ? [
          {
            "@type": "ListItem",
            position: 2,
            name: parent.name,
            item: absoluteUrl(landingPagePath(parent, locale)),
          },
        ]
      : []),
    {
      "@type": "ListItem",
      position: parent ? 3 : 2,
      name: page.name,
      item: absoluteUrl(landingPagePath(page, locale)),
    },
  ];
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: copy.title,
      description: copy.description,
      url: absoluteUrl(landingPagePath(page, locale)),
      inLanguage: locale === "en" ? "en" : "zh-CN",
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
          {messages.common.skipToContent}
        </a>
        <SiteHeader
          locale={locale}
          showSync
          syncLabel={messages.common.syncEveryFourHours}
          syncTitle={
            locale === "en"
              ? "Prices and FX are usually checked in the same four-hour cycle"
              : "价格与汇率通常每 4 小时同轮核验"
          }
        />

        <main id="main-content" className="landing-main">
          <nav
            className="landing-breadcrumbs"
            aria-label={messages.landing.breadcrumb}
          >
            <Link href={locale === "en" ? "/en" : "/"}>{SITE_NAME}</Link>
            <span aria-hidden="true">/</span>
            {parent ? (
              <>
                <Link href={landingPagePath(parent, locale)}>
                  {landingCopy(parent, locale).heading}
                </Link>
                <span aria-hidden="true">/</span>
              </>
            ) : null}
            <span>{page.name}</span>
          </nav>
          <section className="landing-hero" aria-labelledby="landing-title">
            <div className="landing-hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" />
                {messages.landing.indexLabel}
              </p>
              <h1 id="landing-title">{copy.heading}</h1>
              <p className="landing-hero-intro">{copy.intro}</p>
              <div className="landing-meta-line">
                <span>
                  <Clock3 size={15} aria-hidden="true" />
                  {messages.landing.checkedAt}{" "}
                  {formatCheckedAt(checkedAt, locale)}
                </span>
                <span>
                  {page.type === "global" ? (
                    <Globe2 size={15} aria-hidden="true" />
                  ) : (
                    <Database size={15} aria-hidden="true" />
                  )}
                  {messages.pricing.officialSourceCount(providers.length)}
                </span>
                <span data-freshness={data.quality.freshness}>
                  {freshnessLabel(data, locale)}
                </span>
              </div>
            </div>
            <div className="landing-hero-action">
              <p className="landing-aliases">
                {messages.landing.relatedNames}
                {page.aliases.join(locale === "en" ? ", " : "、")}
              </p>
              <CtaBlock links={links} locale={locale} />
            </div>
          </section>

          <LandingSummary data={data} locale={locale} />

          <div className="landing-data-stack">
            {page.type === "global"
              ? data.globalProviders.map((provider) => (
                  <ProviderSection
                    key={provider.id}
                    provider={provider}
                    locale={locale}
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
                locale={locale}
                offers={offersForLandingPage(page, provider)}
              />
            ))}
            {data.apiProviders.map((provider) => (
              <ProviderSection
                key={provider.id}
                provider={provider}
                api
                locale={locale}
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
                  <p className="landing-kicker">
                    {messages.landing.modelIndex}
                  </p>
                  <h2 id="model-index-title">
                    {messages.landing.modelPriceIndex}
                  </h2>
                </div>
                <span className="landing-count">
                  {messages.landing.stableModelsCount(modelRows.length)}
                </span>
              </div>
              <p className="landing-section-description">
                {messages.landing.modelIndexDescription}
              </p>
              {modelRows.length > 0 ? (
                <div className="landing-model-list">
                  {modelRows.map((model) => (
                    <Link
                      key={`${model.providerId}-${model.slug}`}
                      href={`${locale === "en" ? "/en/api-pricing" : "/api-pricing"}?provider=${encodeURIComponent(model.providerId)}&model=${encodeURIComponent(model.slug)}`}
                      className="landing-model-link"
                      prefetch={false}
                    >
                      <span>
                        <strong>{model.name}</strong>
                        <small>{model.providerLabel}</small>
                      </span>
                      <span className="landing-model-prices">
                        {model.offers.slice(0, 3).map((offer) => (
                          <small key={offer.id}>
                            {offer.priceType === "cached_input"
                              ? messages.landing.cache
                              : offer.priceType === "output"
                                ? messages.landing.output
                                : messages.landing.input}{" "}
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
                  {messages.landing.apiModelFallback}
                </p>
              )}
            </section>
          ) : null}

          <RelatedPricePages data={data} locale={locale} />
          <CtaBlock links={links} compact locale={locale} />
        </main>

        <SiteFooter
          locale={locale}
          description={messages.landing.footerDescription}
        />
      </div>
    </>
  );
}
