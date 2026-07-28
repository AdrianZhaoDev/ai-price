"use client";

import { ProviderMark } from "@/components/icons/provider-mark";
import {
  apiRankingEntries,
  type ApiRankingMetric,
} from "@/lib/pricing/api-ranking";
import { formatOfferPrice } from "@/lib/pricing/format";
import type { PriceOffer, ProviderCatalogItem } from "@/lib/pricing/types";
import { useMemo, useState } from "react";

type ApiPriceRankingProps = {
  providers: ProviderCatalogItem[];
};

const metrics: Array<{ id: ApiRankingMetric; label: string }> = [
  { id: "cached_input", label: "缓存输入" },
  { id: "input", label: "非缓存输入" },
  { id: "output", label: "输出" },
];

function compactPrice(offer: PriceOffer | undefined) {
  return offer ? formatOfferPrice(offer) : "—";
}

export function ApiPriceRanking({ providers }: ApiPriceRankingProps) {
  const [metric, setMetric] = useState<ApiRankingMetric>("input");
  const entries = useMemo(
    () => apiRankingEntries(providers, metric),
    [metric, providers],
  );

  return (
    <aside className="api-ranking" aria-labelledby="api-ranking-title">
      <div className="api-ranking-heading">
        <div>
          <p className="api-ranking-kicker">/百万 tokens</p>
          <h2 id="api-ranking-title">API 价格排行榜</h2>
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
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <span className="api-ranking-number">{index + 1}</span>
            <div className="api-ranking-model">
              <ProviderMark
                providerId={entry.providerId}
                color={entry.providerColor}
                size={24}
              />
              <span>
                <strong>{entry.modelName}</strong>
                <small>{entry.providerName}</small>
              </span>
            </div>
            <span
              data-label="缓存输入"
              data-highlight={metric === "cached_input"}
            >
              {compactPrice(entry.cachedInput)}
            </span>
            <span data-label="非缓存输入" data-highlight={metric === "input"}>
              {compactPrice(entry.input)}
            </span>
            <span data-label="输出" data-highlight={metric === "output"}>
              {compactPrice(entry.output)}
            </span>
          </li>
        ))}
      </ol>

      {entries.length === 0 ? (
        <p className="api-ranking-empty">
          暂无统一为每百万 tokens 的完整价格组。
        </p>
      ) : null}
    </aside>
  );
}
