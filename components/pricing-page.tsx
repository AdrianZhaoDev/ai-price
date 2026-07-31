import { PricingExplorer } from "@/components/pricing-explorer";
import { StructuredData } from "@/components/structured-data";
import { modes } from "@/lib/data/catalog";
import { prepareProvidersForClient } from "@/lib/pricing/client-catalog";
import { displayableOffers } from "@/lib/pricing/format";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import type { PriceMode } from "@/lib/pricing/types";
import { absoluteUrl, modeSeo, SITE_NAME, SITE_ORIGIN } from "@/lib/seo";
import Link from "next/link";
import { unstable_cache } from "next/cache";

type PricingPageProps = {
  mode: PriceMode;
};

const loadCachedPricingPageData = unstable_cache(
  async (mode: PriceMode) => {
    const modeProviders = (await loadProviderCatalog(mode)).sort(
      (a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) -
        (b.rank ?? Number.MAX_SAFE_INTEGER),
    );

    return {
      lastCheckedAt: modeProviders
        .map((provider) => provider.lastCheckedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1),
      hasDisplayableMode: modeProviders.some(
        (provider) => displayableOffers(provider.offers).length > 0,
      ),
      clientCatalog: prepareProvidersForClient(modeProviders, mode),
      providerSources: modeProviders.map((provider) => ({
        name: provider.name,
        sourceUrl: provider.sourceUrl,
      })),
    };
  },
  ["pricing-page-data-v1"],
  { revalidate: 900 },
);

export async function PricingPage({ mode }: PricingPageProps) {
  const { lastCheckedAt, hasDisplayableMode, clientCatalog, providerSources } =
    await loadCachedPricingPageData(mode);
  const seo = modeSeo[mode];

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: seo.title,
      description: seo.description,
      url: absoluteUrl(seo.path),
      inLanguage: "zh-CN",
      ...(lastCheckedAt ? { dateModified: lastCheckedAt } : {}),
      creator: {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#organization`,
        name: SITE_NAME,
      },
      variableMeasured:
        mode === "api"
          ? ["缓存输入价格", "非缓存输入价格", "输出价格"]
          : ["官方原币价格", "人民币参考价", "订阅周期"],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${seo.title}官方来源`,
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
          key={mode}
          initialMode={mode}
          modes={modes}
          providers={clientCatalog.providers}
          deferredProviderIds={clientCatalog.deferredProviderIds}
          contactEmail={process.env.CONTACT_EMAIL ?? "price@example.com"}
        />
      ) : (
        <main id="main-content" className="pricing-empty-state">
          <p className="eyebrow">Low Price Radar · AI 价签</p>
          <h1>{seo.title}</h1>
          <p>该分类暂时没有可展示的有效报价，采集恢复后会自动重新显示。</p>
          <nav aria-label="其他价格分类">
            {modes
              .filter((entry) => entry.id !== mode)
              .map((entry) => (
                <Link key={entry.id} href={modeSeo[entry.id].path}>
                  查看{entry.shortLabel}
                </Link>
              ))}
          </nav>
        </main>
      )}
    </>
  );
}
