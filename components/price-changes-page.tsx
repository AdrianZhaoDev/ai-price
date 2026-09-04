import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { loadSubscriptionHistory } from "@/lib/pricing/history";
import { getMessages, type Locale } from "@/lib/i18n";
import { landingPages, landingPagePath } from "@/lib/landing-pages";
import type { SubscriptionHistory } from "@/lib/pricing/history-types";
import { PriceDataLink } from "@/components/price-data-link";
import { absoluteUrl } from "@/lib/seo";

export async function PriceChangesPage({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const messages = getMessages(locale);
  let data: SubscriptionHistory | null;
  try {
    data = await loadSubscriptionHistory();
  } catch {
    data = null;
  }
  const available = Boolean(data?.available);
  return (
    <div className="landing-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: en
              ? "AI Subscription Price Changes and History"
              : "AI 订阅价格变化与历史记录",
            url: absoluteUrl(en ? "/en/price-changes" : "/price-changes"),
            inLanguage: locale,
            description: en
              ? "Confirmed original-currency changes within the subscription products tracked by Low Price Radar."
              : "Low Price Radar 跟踪范围内经过确认的订阅原币价格变化。",
          }).replace(/</g, "\\u003c"),
        }}
      />
      <a className="skip-link" href="#main-content">
        {messages.common.skipToContent}
      </a>
      <SiteHeader locale={locale} showSync />
      <main className="landing-main" id="main-content">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <h1>{en ? "Subscription price changes" : "AI 订阅价格变化"}</h1>
            <p className="landing-hero-intro">
              {en
                ? "Track confirmed official price changes, keep the source, and follow the plans you use."
                : "查看经过确认的官方价格变化，核对来源，持续关注你使用的套餐。"}
            </p>
          </div>
        </section>
        <nav
          className="comparison-actions"
          aria-label={en ? "Price change data" : "价格变化数据"}
        >
          <PriceDataLink format="feed.xml" />
          <PriceDataLink format="prices.csv" />
          <PriceDataLink format="prices.json" />
          <a href="#methodology">{en ? "Data method" : "数据方法"}</a>
        </nav>
        {!available ? (
          <p role="status" className="landing-empty">
            {en
              ? "Price history is temporarily unavailable. Current price tables remain available."
              : "价格历史暂时不可用，可继续查看当前价格表。"}
          </p>
        ) : data!.events.length === 0 ? (
          <p className="landing-empty">
            {en
              ? "No confirmed subscription price changes have been recorded yet."
              : "目前尚未记录到已确认的订阅价格变化。"}
          </p>
        ) : (
          <ol className="price-change-feed">
            {data!.events.map((event) => {
              const parent = landingPages.find(
                (page) =>
                  !page.parentSlug &&
                  Object.values(page.providerIds).some((ids) =>
                    ids?.includes(event.providerId),
                  ),
              );
              return (
                <li key={event.id} id={`change-${event.id}`}>
                  <time dateTime={event.confirmedAt}>
                    {event.confirmedAt.slice(0, 10)}
                  </time>
                  <div>
                    <h2>
                      {event.providerName} · {event.planName}
                    </h2>
                    <p>
                      {event.regionCode ?? event.regionName} · {event.currency}
                    </p>
                    <strong>
                      {event.previousDisplayPrice} → {event.currentDisplayPrice}
                    </strong>
                    <p>
                      {event.currentAmountMinor < event.previousAmountMinor
                        ? en
                          ? "Price decrease"
                          : "原币降价"
                        : en
                          ? "Price increase"
                          : "原币涨价"}
                    </p>
                    <div className="comparison-actions">
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {messages.common.officialSource}
                      </a>
                      {parent ? (
                        <Link href={landingPagePath(parent, locale)}>
                          {en ? "Compare this product" : "比较此产品"}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <section className="landing-data-section" id="methodology">
          <h2>{en ? "What this feed measures" : "这份记录的范围"}</h2>
          <p>
            {en
              ? "The latest 100 confirmed changes across the subscription products tracked by this site. It is a fixed collection scope, not an industry-wide price index. A change requires two independent matching collections. Original currency, billing period and source must remain comparable."
              : "本站跟踪的订阅产品中，最近 100 条已确认变化。这是固定采集范围内的记录，不是全行业价格指数。变价需要两次独立采集结果一致，并保持原币、账期和来源可比。"}
          </p>
          <p>
            {en
              ? "FX-only changes, a switch of currency or billing period, and unconfirmed candidates are excluded. The confirmation date can be later than the actual price change. The official page is the final reference."
              : "记录排除单独的汇率波动、币种或账期切换以及尚未确认的候选变化。本站确认日期可能晚于实际变价日，以官方页面为准。"}
          </p>
          <p>
            {en
              ? "An App Store price moving sixfold or more in either direction is withheld if either original plan name has also been recorded with another billing period for the same product, including other storefronts. Such names can refer to monthly or annual purchases. These observations remain stored for review; an omitted change may still be real, and no recorded ambiguity does not guarantee the period is correct."
              : "如果同一产品的 App Store 原始套餐名称曾记录过不同账期（含其他地区），且前后正价相差六倍或以上，该变化暂不公开，保留原始记录待复核。同名可能对应月付或年付；被暂缓的变化仍可能是真实调价，未发现歧义记录也不保证账期完全正确。"}
          </p>
          <p>
            {en
              ? "CSV and JSON contain observed prices and source links, not copies of official pages. Credit Low Price Radar and the original sources when referencing these observations. Source rights remain with their owners; this does not relicense third-party content. Data is provided as observed, without a price or availability guarantee."
              : "CSV 和 JSON 提供观测到的价格事实与来源链接，不包含官方页面全文。引用时请注明 Low Price Radar 和原始来源；来源内容权利归原权利人所有，此处不对第三方内容重新授权。数据按观测结果提供，不保证持续价格或可购买性。"}
          </p>
          <Link href={en ? "/en/methodology" : "/methodology"}>
            {messages.common.methodology}
          </Link>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
