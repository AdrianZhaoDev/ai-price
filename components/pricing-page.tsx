import { PricingExplorer } from "@/components/pricing-explorer";
import { StructuredData } from "@/components/structured-data";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { modes } from "@/lib/data/catalog";
import { landingPagePath, landingPagesForMode } from "@/lib/landing-pages";
import { loadCachedPricingPageData } from "@/lib/pricing/page-cache";
import { prepareProvidersForClient } from "@/lib/pricing/client-catalog";
import type { PriceMode } from "@/lib/pricing/types";
import {
  absoluteUrl,
  modeSeoByLocale,
  SITE_NAME,
  SITE_ORIGIN,
} from "@/lib/seo";
import Link from "next/link";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/lib/i18n";

type PricingPageProps = {
  mode: PriceMode;
  locale?: Locale;
  query?: {
    providerId?: string;
    planId?: string;
    modelSlug?: string;
  };
};

export async function PricingPage({
  mode,
  query,
  locale = DEFAULT_LOCALE,
}: PricingPageProps) {
  const {
    lastCheckedAt,
    priceModifiedAt,
    hasDisplayableMode,
    providers,
    rankingChanges,
    providerSources,
  } = await loadCachedPricingPageData(mode);
  const clientCatalog = prepareProvidersForClient(
    providers,
    mode,
    query?.providerId,
  );
  const seo = modeSeoByLocale[locale][mode];
  const messages = getMessages(locale);
  const priceIndexLinks = landingPagesForMode(mode).map((page) => ({
    href: landingPagePath(page, locale),
    label: page.name,
    description:
      page.type === "global"
        ? locale === "en"
          ? "Global official subscription prices"
          : "全球官方订阅地区价格"
        : page.providerIds["china-subscription"]?.length &&
            page.providerIds.api?.length
          ? locale === "en"
            ? "Official subscription and API prices"
            : "订阅与 API 官方价格"
          : page.providerIds.api?.length
            ? locale === "en"
              ? "Official model API prices"
              : "模型 API 官方价格"
            : locale === "en"
              ? "Official subscription plans"
              : "官方订阅套餐价格",
  }));
  if (mode === "global") {
    priceIndexLinks.push(
      {
        href: modeSeoByLocale[locale]["china-subscription"].path,
        label: messages.pricing.domesticSubscriptionLink,
        description:
          locale === "en"
            ? "View official China plans and resource packs"
            : "查看国内官方会员与资源包",
      },
      {
        href: modeSeoByLocale[locale].api.path,
        label: messages.pricing.apiRankingLink,
        description:
          locale === "en"
            ? "Compare model input, output, and cache unit prices"
            : "比较模型输入、输出与缓存单价",
      },
    );
  }

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: seo.title,
      description: seo.description,
      url: absoluteUrl(seo.path),
      inLanguage: locale === "en" ? "en" : "zh-CN",
      ...(priceModifiedAt ? { dateModified: priceModifiedAt } : {}),
      creator: {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#organization`,
        name: SITE_NAME,
      },
      variableMeasured:
        mode === "api"
          ? locale === "en"
            ? ["Cached input price", "Input price", "Output price"]
            : ["缓存输入价格", "非缓存输入价格", "输出价格"]
          : locale === "en"
            ? [
                "Official original-currency price",
                "CNY reference",
                "Billing period",
              ]
            : ["官方原币价格", "人民币参考价", "订阅周期"],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name:
        locale === "en"
          ? `${seo.title} official sources`
          : `${seo.title}官方来源`,
      numberOfItems: providerSources.length,
      itemListElement: providerSources.map((provider, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: provider.name,
        url: provider.sourceUrl,
      })),
    },
  ];

  return (
    <>
      <StructuredData data={structuredData} />
      {hasDisplayableMode ? (
        <PricingExplorer
          key={`${mode}:${lastCheckedAt ?? "seed"}`}
          initialMode={mode}
          locale={locale}
          modes={modes}
          providers={clientCatalog.providers}
          deferredProviderIds={clientCatalog.deferredProviderIds}
          rankingChanges={rankingChanges}
          contactEmail={process.env.CONTACT_EMAIL ?? "price@example.com"}
          dataVersion={lastCheckedAt ?? null}
          initialQuery={query}
          priceIndexLinks={priceIndexLinks}
        />
      ) : (
        <div className="app-shell pricing-shell">
          <a className="skip-link" href="#main-content">
            {messages.common.skipToContent}
          </a>
          <SiteHeader
            locale={locale}
            activeMode={mode}
            showSync
            syncLabel={messages.common.syncEveryFourHours}
            syncTitle={messages.common.syncTitle}
          />
          <main id="main-content" className="pricing-empty-state">
            <p className="eyebrow">
              Low Price Radar · {messages.brand.tagline}
            </p>
            <h1>
              {locale === "en" ? messages.pricing.titles[mode] : seo.title}
            </h1>
            <p>{messages.pricing.emptyDescription}</p>
            <nav aria-label={messages.pricing.otherCategories}>
              {modes
                .filter((entry) => entry.id !== mode)
                .map((entry) => (
                  <Link
                    key={entry.id}
                    href={modeSeoByLocale[locale][entry.id].path}
                  >
                    {messages.pricing.viewCategory(
                      messages.nav.modes[entry.id],
                    )}
                  </Link>
                ))}
            </nav>
          </main>
          <SiteFooter locale={locale} />
        </div>
      )}
    </>
  );
}
