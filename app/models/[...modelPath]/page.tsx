import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { modes } from "@/lib/data/catalog";
import { loadCachedModelDetail } from "@/lib/model-catalog/cache";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import { absoluteUrl, modeHref, SITE_NAME } from "@/lib/seo";

export const revalidate = false;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

function joinModelId(path: string[]) {
  return path.map(decodeURIComponent).join("/");
}
function tokens(value?: number) {
  return value === undefined ? "—" : value.toLocaleString("en-US");
}
function price(value?: number) {
  return value === undefined
    ? "—"
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}
function yesNo(value?: boolean) {
  return value === undefined ? "—" : value ? "是" : "否";
}
function priceTierDetails(costDetails?: Record<string, unknown>) {
  if (!costDetails) return undefined;
  const { input: _input, output: _output, ...details } = costDetails;
  void _input;
  void _output;
  return Object.keys(details).length ? details : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ modelPath: string[] }>;
}): Promise<Metadata> {
  const { modelPath } = await params;
  const model = await loadCachedModelDetail(joinModelId(modelPath));
  if (!model) return {};
  const path = modelDetailPath(model.id);
  const description =
    model.description ??
    `${model.name} 的规格、上下文、输出限制与 provider API 价格。`;
  return {
    title: `${model.name} API 价格与模型规格`,
    description,
    alternates: { canonical: path },
    robots: model.active ? undefined : { index: false, follow: true },
    openGraph: {
      type: "article",
      locale: "zh_CN",
      siteName: SITE_NAME,
      url: path,
      title: `${model.name} API 价格与模型规格`,
      description,
    },
  };
}

export default async function ModelPage({
  params,
}: {
  params: Promise<{ modelPath: string[] }>;
}) {
  const { modelPath } = await params;
  const model = await loadCachedModelDetail(joinModelId(modelPath));
  if (!model) notFound();
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "API 模型目录",
        item: absoluteUrl("/api-pricing"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: model.name,
        item: absoluteUrl(modelDetailPath(model.id)),
      },
    ],
  };
  const facts = [
    ["完整 ID", model.id],
    ["Lab", model.labName],
    ["Family", model.family ?? "—"],
    ["Providers", String(model.providerCount)],
    ["Context", tokens(model.context)],
    ["Output limit", tokens(model.output)],
    ["Knowledge", model.knowledge ?? "—"],
    ["Release", model.releaseDate],
    ["Updated", model.updatedDate],
    ["Weights", model.openWeights ? "Open weights" : "Closed / 未公开"],
    ["Input", model.inputModalities.join(" · ") || "—"],
    ["Output types", model.outputModalities.join(" · ") || "—"],
  ];
  return (
    <div className="app-shell model-detail-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c"),
        }}
      />
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Low Price Radar 首页">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <strong>Low Price Radar</strong>
            <small>AI订阅全球比价</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="价格模式">
          {modes.map((mode) => (
            <Link
              key={mode.id}
              href={modeHref(mode.id)}
              className="nav-item pressable"
              data-mode={mode.id}
              aria-current={mode.id === "api" ? "page" : undefined}
              aria-label={mode.shortLabel}
            >
              {mode.id === "api" ? "API 模型" : mode.shortLabel}
              {mode.id === "api" ? (
                <span className="nav-label-compact" aria-hidden="true">
                  API 榜单
                </span>
              ) : null}
              {mode.id === "api" ? (
                <span className="nav-hot-badge" aria-hidden="true">
                  Hot
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className="main-content model-detail-main">
        <nav className="model-breadcrumb" aria-label="面包屑">
          <Link href="/api-pricing">API 模型目录</Link>
          <span>/</span>
          <span>{model.name}</span>
        </nav>
        {!model.active ? (
          <div className="model-archived" role="status">
            该模型在最新目录中暂不可用；此页保留历史信息。
          </div>
        ) : null}
        <header className="model-detail-hero">
          <p className="eyebrow">
            {model.labName} ·{" "}
            {model.origin === "local_overlay" ? "LOCAL OVERLAY" : "MODELS.DEV"}
          </p>
          <h1>{model.name}</h1>
          <p>{model.description ?? "暂无模型描述。"}</p>
          <code>{model.id}</code>
        </header>
        <dl className="model-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <section
          className="model-capabilities"
          aria-labelledby="capability-title"
        >
          <h2 id="capability-title">Capabilities</h2>
          <div>
            {Object.entries({
              Reasoning: model.capabilities.reasoning,
              Attachment: model.capabilities.attachment,
              "Tool call": model.capabilities.toolCall,
              Structured: model.capabilities.structuredOutput,
              Temperature: model.capabilities.temperature,
            }).map(([label, value]) => (
              <span key={label} data-enabled={value || undefined}>
                {label} · {yesNo(value)}
              </span>
            ))}
          </div>
        </section>
        <section
          className="model-provider-section"
          aria-labelledby="provider-title"
        >
          <div className="model-section-heading">
            <div>
              <p className="eyebrow">SERVING OPTIONS</p>
              <h2 id="provider-title">Providers</h2>
            </div>
            <span>{model.providers.length} 个报价</span>
          </div>
          <div className="model-table-scroll" tabIndex={0}>
            <table className="model-provider-table">
              <thead>
                <tr>
                  {[
                    "Provider",
                    "Lab",
                    "Model ID",
                    "Context",
                    "Output",
                    "Input Price",
                    "Output Price",
                    "Price tiers",
                    "Reasoning",
                    "Tool Call",
                    "Structured",
                    "Temperature",
                    "状态",
                    "来源",
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.providers.map((provider) => {
                  const tierDetails = priceTierDetails(provider.costDetails);
                  return (
                    <tr
                      key={`${provider.providerId}:${provider.providerModelId}`}
                    >
                      <th scope="row">
                        <Link
                          href={`/api-pricing?provider=${encodeURIComponent(provider.providerId)}`}
                        >
                          {provider.providerName}
                        </Link>
                        <small>
                          {provider.origin === "local_overlay"
                            ? "local overlay"
                            : "models.dev"}
                        </small>
                      </th>
                      <td>{provider.labName}</td>
                      <td>
                        <code>{provider.providerModelId}</code>
                      </td>
                      <td>{tokens(provider.context)}</td>
                      <td>{tokens(provider.output)}</td>
                      <td>{price(provider.inputPrice)}</td>
                      <td>{price(provider.outputPrice)}</td>
                      <td>
                        {tierDetails ? (
                          <details className="model-price-tiers">
                            <summary>
                              {Object.keys(tierDetails).length} 项明细
                            </summary>
                            <pre>{JSON.stringify(tierDetails, null, 2)}</pre>
                          </details>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{yesNo(provider.capabilities.reasoning)}</td>
                      <td>{yesNo(provider.capabilities.toolCall)}</td>
                      <td>{yesNo(provider.capabilities.structuredOutput)}</td>
                      <td>{yesNo(provider.capabilities.temperature)}</td>
                      <td>
                        <span
                          className={`model-status model-status-${provider.status ?? "active"}`}
                        >
                          {provider.status ?? "active"}
                        </span>
                      </td>
                      <td>
                        {provider.sourceUrl ? (
                          <a
                            href={provider.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            查看 ↗
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="model-provenance">
          <strong>数据来源与版本</strong>
          <p>
            模型目录来自 models.dev 社区数据；价格为 USD / 百万
            tokens，并非本站官方采集价格。
          </p>
          <a href={model.sourceUrl} target="_blank" rel="noreferrer">
            查看固定 commit {model.catalogVersion.slice(0, 12)} ↗
          </a>
        </aside>
      </main>
      <footer className="site-footer">
        <div>
          <strong>Low Price Radar</strong>
          <p>API 模型规格与社区聚合价格目录。</p>
        </div>
        <div className="footer-links">
          <Link href="/methodology">采集方法</Link>
          <Link href="/privacy">隐私</Link>
        </div>
      </footer>
    </div>
  );
}
