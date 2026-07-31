"use client";

import { ProviderMark } from "@/components/icons/provider-mark";
import { ChangeBadge } from "@/components/change-badge";
import {
  apiRankingEntries,
  rankingCnyValue,
  type ApiRankingChange,
  type ApiRankingEntry,
  type ApiRankingMetric,
} from "@/lib/pricing/api-ranking";
import { formatApiCny, formatOfferPrice } from "@/lib/pricing/format";
import type { PriceOffer, ProviderCatalogItem } from "@/lib/pricing/types";
import { useEffect, useId, useMemo, useRef } from "react";

type ApiPriceRankingProps = {
  providers: ProviderCatalogItem[];
  changes?: ApiRankingChange[];
  onSelectEntry: (selection: ApiRankingSelection) => void;
  onSubscribe: () => void;
  metric: ApiRankingMetric;
  onMetricChange: (metric: ApiRankingMetric) => void;
  focusRequest?: ApiRankingFocusRequest | null;
};

export type ApiRankingSelection = {
  providerId: string;
  modelSlug: string;
  offerId: string;
};

export type ApiRankingFocusRequest = {
  providerId: string;
  modelSlug?: string;
  offerId?: string;
  requestId: number;
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
  changes = [],
  onSelectEntry,
  onSubscribe,
  metric,
  onMetricChange,
  focusRequest,
}: ApiPriceRankingProps) {
  const titleId = useId();
  const entryRefs = useRef(new Map<string, HTMLButtonElement>());
  const highlightedEntryRef = useRef<HTMLButtonElement | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const entries = useMemo(
    () => apiRankingEntries(providers, metric),
    [metric, providers],
  );
  const changesByEntry = useMemo(
    () =>
      new Map(
        changes
          .filter((change) => change.metric === metric)
          .map((change) => [change.entryId, change]),
      ),
    [changes, metric],
  );

  useEffect(() => {
    if (!focusRequest) return;
    highlightedEntryRef.current?.removeAttribute("data-highlighted");
    highlightedEntryRef.current = null;
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    const entry = focusRequest.modelSlug
      ? entries.find(
          (candidate) =>
            candidate.providerId === focusRequest.providerId &&
            candidate.modelSlug === focusRequest.modelSlug,
        )
      : entries.find(
          (candidate) => candidate.providerId === focusRequest.providerId,
        );
    if (!entry) return;
    const node = entryRefs.current.get(entry.id);
    if (!node || node.offsetParent === null) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.setAttribute("data-highlighted", "true");
    highlightedEntryRef.current = node;
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      node.removeAttribute("data-highlighted");
      if (highlightedEntryRef.current === node) {
        highlightedEntryRef.current = null;
      }
      highlightTimeoutRef.current = null;
    }, 3000);
  }, [entries, focusRequest, metric]);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      highlightedEntryRef.current?.removeAttribute("data-highlighted");
    },
    [],
  );

  return (
    <aside className="api-ranking" aria-labelledby={titleId}>
      <div className="api-ranking-heading">
        <div>
          <p className="api-ranking-kicker">/百万 tokens</p>
          <h2 id={titleId}>API 价格排行榜</h2>
        </div>
        <div className="api-ranking-heading-actions">
          <span>{entries.length} 个模型</span>
          <button type="button" onClick={onSubscribe}>
            订阅排行榜变动
          </button>
        </div>
      </div>

      <div className="api-ranking-switch" aria-label="选择排行价格">
        {metrics.map((item) => (
          <button
            type="button"
            key={item.id}
            data-active={metric === item.id}
            aria-pressed={metric === item.id}
            onClick={() => onMetricChange(item.id)}
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
          const change = changesByEntry.get(entry.id);
          const rankLabel = change?.isNew
            ? "新"
            : change?.rankDelta
              ? `${change.rankDelta > 0 ? "↑" : "↓"}${Math.abs(change.rankDelta)}`
              : change?.priceDirection === "decrease"
                ? "降价"
                : change?.priceDirection === "increase"
                  ? "涨价"
                  : null;
          const rankTone = change?.isNew
            ? "info"
            : (change?.rankDelta ?? 0) !== 0
              ? change!.rankDelta! > 0
                ? "positive"
                : "negative"
              : change?.priceDirection === "decrease"
                ? "positive"
                : "negative";
          const changeDetails = change
            ? [
                change.isNew
                  ? `新上榜 · 当前第 ${change.currentRank} 名`
                  : `原排名 ${change.previousRank ?? "—"} · 现排名 ${change.currentRank}`,
                change.rankDelta
                  ? `${change.rankDelta > 0 ? "上升" : "下降"} ${Math.abs(change.rankDelta)} 名`
                  : "排名未变",
                `原价格 ${change.previousDisplayPrice ?? "—"} · 现价格 ${change.currentDisplayPrice ?? "—"}`,
                `人民币参考 ${change.previousPriceCny === null ? "—" : formatApiCny(change.previousPriceCny)} → ${change.currentPriceCny === null ? "—" : formatApiCny(change.currentPriceCny)}`,
                `确认时间 ${new Date(change.changedAt).toLocaleString("zh-CN", { hour12: false })}`,
              ]
            : [];
          return (
            <li key={entry.id} className="api-ranking-entry-shell">
              <button
                type="button"
                className="api-ranking-entry"
                data-provider-id={entry.providerId}
                data-model-slug={entry.modelSlug}
                data-offer-id={offer?.id}
                aria-label={`查看 ${entry.providerName} ${entry.modelName} 价格`}
                ref={(node) => {
                  if (node) {
                    entryRefs.current.set(entry.id, node);
                  } else {
                    entryRefs.current.delete(entry.id);
                  }
                }}
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
              {change && rankLabel ? (
                <ChangeBadge
                  className="api-ranking-change"
                  label={rankLabel}
                  tone={rankTone}
                  ariaLabel={`${entry.modelName} 排行榜变化：${rankLabel}`}
                  details={changeDetails}
                />
              ) : null}
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
