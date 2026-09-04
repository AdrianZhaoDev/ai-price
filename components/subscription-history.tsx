"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { SubscriptionHistory } from "@/lib/pricing/history-types";
import { trackTrafficEvent } from "@/lib/analytics/traffic";

export function SubscriptionHistoryPanel({
  providerId,
  planId,
  regions,
  locale,
}: {
  providerId: string;
  planId: string;
  regions: string[];
  locale: Locale;
}) {
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SubscriptionHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/pricing-data/history/${encodeURIComponent(providerId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("History unavailable");
        const payload = (await response.json()) as SubscriptionHistory;
        if (!payload.available || !Array.isArray(payload.events))
          throw new Error("Invalid history");
        if (!controller.signal.aborted) {
          setFailed(false);
          setData(payload);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, providerId, attempt]);
  const events = data?.events.filter(
    (event) =>
      event.planId === planId &&
      event.regionCode &&
      regions.includes(event.regionCode),
  );
  return (
    <div className="subscription-history">
      <button
        type="button"
        className="secondary-button pressable"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open)
            trackTrafficEvent("pricing_history_opened", {
              mode: "global",
              provider_id: providerId,
              plan_id: planId,
            });
        }}
      >
        {open
          ? en
            ? "Hide price history"
            : "收起价格历史"
          : en
            ? "View confirmed price history"
            : "查看已确认的价格历史"}
      </button>
      {open ? (
        <div aria-live="polite">
          <p className="comparison-note">
            {en
              ? "Original-currency changes confirmed in two separate collections. FX-only changes are excluded. Dates show confirmation, not the provider's effective date."
              : "仅展示两轮采集确认的原币变化，不包含单独的汇率变化。日期为本站确认时间，不代表官方生效日。"}
          </p>
          {failed ? (
            <p role="status">
              {en ? "History is temporarily unavailable." : "历史暂时不可用。"}{" "}
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  setAttempt(attempt + 1);
                }}
              >
                {en ? "Retry" : "重试"}
              </button>
            </p>
          ) : !data ? (
            <p role="status">{en ? "Loading history…" : "正在加载历史…"}</p>
          ) : events?.length ? (
            <ol>
              {events.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.confirmedAt}>
                    {event.confirmedAt.slice(0, 10)}
                  </time>
                  <span>
                    {event.regionCode} · {event.previousDisplayPrice} →{" "}
                    {event.currentDisplayPrice} {event.currency}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              {en
                ? "No confirmed change for these regions in the recent records. This does not mean the price has never changed."
                : "近期记录中尚未查到这两个地区的已确认变化，不代表价格从未变化。"}
            </p>
          )}
          {data ? (
            <small>
              {en
                ? `Searches the latest ${data.limit} confirmed changes for this product.`
                : `查询此产品最近 ${data.limit} 条已确认变化。`}
            </small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
