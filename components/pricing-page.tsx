import { PricingExplorer } from "@/components/pricing-explorer";
import { StructuredData } from "@/components/structured-data";
import { modes } from "@/lib/data/catalog";
import { landingPagePath, landingPagesForMode } from "@/lib/landing-pages";
import { loadCachedPricingPageData } from "@/lib/pricing/page-cache";
import { prepareProvidersForClient } from "@/lib/pricing/client-catalog";
import type { PriceMode } from "@/lib/pricing/types";
import { absoluteUrl, modeSeo, SITE_NAME, SITE_ORIGIN } from "@/lib/seo";
import Link from "next/link";

type PricingPageProps = {
  mode: PriceMode;
  query?: {
    providerId?: string;
    planId?: string;
    modelSlug?: string;
  };
};

export async function PricingPage({ mode, query }: PricingPageProps) {
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
  const seo = modeSeo[mode];
  const priceIndexLinks = landingPagesForMode(mode).map((page) => ({
    href: landingPagePath(page),
    label: page.name,
    description:
      page.type === "global"
        ? "全球官方订阅地区价格"
        : page.providerIds["china-subscription"]?.length &&
            page.providerIds.api?.length
          ? "订阅与 API 官方价格"
          : page.providerIds.api?.length
            ? "模型 API 官方价格"
            : "官方订阅套餐价格",
  }));
  if (mode === "global") {
    priceIndexLinks.push(
      {
        href: modeSeo["china-subscription"].path,
        label: "国内 AI 订阅",
        description: "查看国内官方会员与资源包",
      },
      {
        href: modeSeo.api.path,
        label: "API 价格排行榜",
        description: "比较模型输入、输出与缓存单价",
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
      inLanguage: "zh-CN",
      ...(priceModifiedAt ? { dateModified: priceModifiedAt } : {}),
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
          key={`${mode}:${lastCheckedAt ?? "seed"}`}
          initialMode={mode}
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
        <main id="main-content" className="pricing-empty-state">
          <p className="eyebrow">Low Price Radar · AI订阅全球比价</p>
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
