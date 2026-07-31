"use client";

import { ProviderMark } from "@/components/icons/provider-mark";
import {
  apiRankingEntries,
  rankingCnyValue,
  type ApiRankingEntry,
  type ApiRankingMetric,
} from "@/lib/pricing/api-ranking";
import { formatApiCny, formatOfferPrice } from "@/lib/pricing/format";
import type { PriceOffer, ProviderCatalogItem } from "@/lib/pricing/types";
import { useId, useMemo, useState } from "react";

type ApiPriceRankingProps = {
  providers: ProviderCatalogItem[];
  onSelectEntry: (selection: ApiRankingSelection) => void;
};

export type ApiRankingSelection = {
  providerId: string;
  modelSlug: string;
  offerId: string;
};

const metrics: Array<{ id: ApiRankingMetric; label: string }> = [
  { id: "cached_input", label: "缓存输入" },
  { id: "input", label: "非缓存输入" },
  { id: "output", label: "输出" },
];

function CompactPrice({ offer }: { offer: PriceOffer | undefined }) {
  if (!offer) return <>—</>;
  const value = rankingCnyValue(offer);
  return (
    <>
      <strong>{formatApiCny(value)}</strong>
      {offer.currency?.toUpperCase() !== "CNY" ? (
        <small>{formatOfferPrice(offer)}</small>
      ) : null}
    </>
  );
}

function selectedOffer(
  entry: ApiRankingEntry,
  metric: ApiRankingMetric,
): PriceOffer | undefined {
  return (
    (metric === "cached_input"
      ? entry.cachedInput
      : metric === "input"
        ? entry.input
        : entry.output) ??
    entry.input ??
    entry.cachedInput ??
    entry.output
  );
}

export function ApiPriceRanking({
  providers,
  onSelectEntry,
}: ApiPriceRankingProps) {
  const titleId = useId();
  const [metric, setMetric] = useState<ApiRankingMetric>("input");
  const entries = useMemo(
    () => apiRankingEntries(providers, metric),
    [metric, providers],
  );

  return (
    <aside className="api-ranking" aria-labelledby={titleId}>
      <div className="api-ranking-heading">
        <div>
          <p className="api-ranking-kicker">/百万 tokens</p>
          <h2 id={titleId}>API 价格排行榜</h2>
        </div>
        <span>{entries.length} 个模型</span>
      </div>

      <div className="api-ranking-switch" aria-label="选择排行价格">
        {metrics.map((item) => (
          <button
            type="button"
            key={item.id}
            data-active={metric === item.id}
            aria-pressed={metric === item.id}
            onClick={() => setMetric(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="api-ranking-columns" aria-hidden="true">
        <span>模型</span>
        <span>缓存</span>
        <span>非缓存</span>
        <span>输出</span>
      </div>

      <ol className="api-ranking-list">
        {entries.map((entry, index) => {
          const offer = selectedOffer(entry, metric);
          return (
            <li key={entry.id}>
              <button
                type="button"
                className="api-ranking-entry"
                data-provider-id={entry.providerId}
                data-model-slug={entry.modelSlug}
                data-offer-id={offer?.id}
                aria-label={`查看 ${entry.providerName} ${entry.modelName} 价格`}
                onClick={() => {
                  if (!offer) return;
                  onSelectEntry({
                    providerId: entry.providerId,
                    modelSlug: entry.modelSlug,
                    offerId: offer.id,
                  });
                }}
              >
                <span className="api-ranking-number">{index + 1}</span>
                <span className="api-ranking-model">
                  <ProviderMark
                    providerId={entry.providerId}
                    color={entry.providerColor}
                    size={24}
                  />
                  <span>
                    <strong>{entry.modelName}</strong>
                    <small>{entry.providerName}</small>
                  </span>
                </span>
                <span
                  data-label="缓存输入"
                  data-highlight={metric === "cached_input"}
                >
                  <CompactPrice offer={entry.cachedInput} />
                </span>
                <span
                  data-label="非缓存输入"
                  data-highlight={metric === "input"}
                >
                  <CompactPrice offer={entry.input} />
                </span>
                <span data-label="输出" data-highlight={metric === "output"}>
                  <CompactPrice offer={entry.output} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {entries.length === 0 ? (
        <p className="api-ranking-empty">
          暂无统一为每百万 tokens 的完整价格组。
        </p>
      ) : null}
    </aside>
  );
}
