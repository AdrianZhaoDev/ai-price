"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { ProviderCatalogItem } from "@/lib/pricing/types";
import {
  compareSubscriptions,
  comparisonPath,
  isComparableSubscription,
} from "@/lib/pricing/comparison";
import {
  formatCny,
  formatOfferDisplayPrice,
  formatOfferPlanName,
  formatPeriod,
  formatRegionName,
} from "@/lib/pricing/format";
import { trackTrafficEvent } from "@/lib/analytics/traffic";
import { SubscriptionHistoryPanel } from "@/components/subscription-history";

export function SubscriptionComparison({
  provider,
  locale,
  planId,
  onFollow,
}: {
  provider: ProviderCatalogItem;
  locale: Locale;
  planId?: string | null;
  onFollow?: () => void;
}) {
  const en = locale === "en";
  const dateLabel = (value?: string) =>
    value?.slice(0, 10) ?? (en ? "Unknown" : "未知");
  const allOffers = useMemo(
    () => provider.offers.filter(isComparableSubscription),
    [provider],
  );
  const plans = useMemo(
    () => [
      ...new Map(allOffers.map((offer) => [offer.planId, offer])).values(),
    ],
    [allOffers],
  );
  const [localPlan, setLocalPlan] = useState(planId ?? plans[0]?.planId ?? "");
  const currentPlan = planId ?? localPlan;
  const offers = useMemo(
    () => allOffers.filter((offer) => offer.planId === currentPlan),
    [allOffers, currentPlan],
  );
  const [firstRegion, setFirstRegion] = useState("US");
  const [secondRegion, setSecondRegion] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    const readSelection = () => {
      if (!window.location.hash.startsWith("#compare?")) return;
      const query = new URLSearchParams(window.location.hash.slice(9));
      setFirstRegion(query.get("from") ?? "US");
      setSecondRegion(query.get("to") ?? "");
    };
    readSelection();
    window.addEventListener("hashchange", readSelection);
    return () => window.removeEventListener("hashchange", readSelection);
  }, []);

  const first =
    offers.find((offer) => offer.regionCode === firstRegion) ?? offers[0];
  const second =
    offers.find(
      (offer) =>
        offer.regionCode === secondRegion &&
        offer.regionCode !== first?.regionCode,
    ) ??
    offers
      .filter((offer) => offer.regionCode !== first?.regionCode)
      .sort((a, b) => a.convertedCny! - b.convertedCny!)[0];
  if (!first || !second) return null;
  const comparison = compareSubscriptions(first, second);
  if (!comparison) return null;
  const firstName = formatRegionName(first, locale);
  const secondName = formatRegionName(second, locale);
  const cheaperName = comparison.differenceCny >= 0 ? firstName : secondName;
  const dearerName = comparison.differenceCny >= 0 ? secondName : firstName;
  const resultText =
    Math.abs(comparison.differenceCny) < 0.005
      ? en
        ? "Both regions have the same reference price per billing period."
        : "两地每个账期的参考价格相同。"
      : en
        ? `${cheaperName} is ${formatCny(Math.abs(comparison.differenceCny), locale)} lower than ${dearerName} per billing period.`
        : `${cheaperName}每个账期比${dearerName}低 ${formatCny(Math.abs(comparison.differenceCny), locale)}。`;
  const annualText =
    first.billingPeriod === "year"
      ? en
        ? "Annual plan difference"
        : "年付套餐差额"
      : en
        ? `${comparison.paymentsPerYear} payments at today's price`
        : `按当前价格连续支付 ${comparison.paymentsPerYear} 次`;
  const sharePath = comparisonPath({
    locale,
    providerId: provider.id,
    planId: first.planId,
    firstRegion: first.regionCode!,
    secondRegion: second.regionCode!,
  });
  const eventProperties = {
    mode: "global" as const,
    provider_id: provider.id,
    plan_id: first.planId,
  };

  function changed(action: () => void) {
    action();
    setCopyStatus("idle");
    trackTrafficEvent("subscription_comparison_changed", eventProperties);
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(
        `${provider.name} · ${formatOfferPlanName(first, locale)}\n${resultText}\n${annualText}: ${formatCny(Math.abs(comparison!.annualDifferenceCny), locale)}\n${[first, second].map((offer) => `${formatRegionName(offer, locale)}: ${formatOfferDisplayPrice(offer, locale)} ${offer.currency}; ${en ? "checked" : "核验"} ${dateLabel(offer.lastCheckedAt ?? offer.observedAt)}; FX ${dateLabel(offer.fxRateObservedAt)}`).join("\n")}\n${comparison!.hasStaleQuote ? (en ? "Quote update delayed. " : "报价更新延迟。") : ""}${en ? "Reference only; prices and FX can change. Annualized estimates are not annual-plan quotes." : "仅为参考，价格和汇率可能变化。年化估算不是年付套餐报价。"}\n${new URL(sharePath, window.location.origin)}`,
      );
      setCopyStatus("copied");
      trackTrafficEvent("subscription_comparison_shared", eventProperties);
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <section
      className="subscription-comparison"
      id="compare"
      aria-labelledby={`compare-title-${provider.id}`}
    >
      <div className="comparison-heading">
        <div>
          <h2 id={`compare-title-${provider.id}`}>
            {en ? "Compare two regions" : "算一算，两地差多少"}
          </h2>
          <p>
            {en
              ? "Same App Store plan and billing period. Original prices stay visible."
              : "同一 App Store 套餐、同一账期，保留原币价格。"}
          </p>
        </div>
        {!planId && plans.length > 1 ? (
          <label>
            {en ? "Plan" : "套餐"}
            <select
              aria-label={en ? "Plan" : "套餐"}
              value={currentPlan}
              onChange={(event) =>
                changed(() => setLocalPlan(event.target.value))
              }
            >
              {plans.map((offer) => (
                <option key={offer.planId} value={offer.planId}>
                  {formatOfferPlanName(offer, locale)}
                  {formatPeriod(offer.billingPeriod, locale)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="comparison-regions">
        {[
          {
            offer: first,
            label: en ? "First region" : "地区 A",
            change: setFirstRegion,
            exclude: undefined,
          },
          {
            offer: second,
            label: en ? "Second region" : "地区 B",
            change: setSecondRegion,
            exclude: first.regionCode,
          },
        ].map(({ offer, label, change, exclude }) => (
          <div className="comparison-region" key={label}>
            <label>
              {label}
              <select
                aria-label={label}
                value={offer.regionCode}
                onChange={(event) => changed(() => change(event.target.value))}
              >
                {offers
                  .filter((candidate) => candidate.regionCode !== exclude)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.regionCode}>
                      {formatRegionName(candidate, locale)}
                    </option>
                  ))}
              </select>
            </label>
            <strong>
              {formatOfferDisplayPrice(offer, locale)}{" "}
              <small>{offer.currency}</small>
            </strong>
            <p>
              {formatCny(offer.convertedCny, locale)} ·{" "}
              {en ? "FX date" : "汇率日期"} {dateLabel(offer.fxRateObservedAt)}
            </p>
            <a
              href={offer.sourceUrl ?? provider.sourceUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                trackTrafficEvent(
                  "pricing_official_source_opened",
                  eventProperties,
                )
              }
            >
              {en ? "Check official price" : "核对官方价格"}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <small>
              {en ? "Last checked" : "最近核验"}{" "}
              {dateLabel(offer.lastCheckedAt ?? offer.observedAt)}
              {offer.status === "stale"
                ? en
                  ? " · Update delayed"
                  : " · 更新延迟"
                : ""}
            </small>
          </div>
        ))}
      </div>
      <div className="comparison-result" aria-live="polite">
        <p>{resultText}</p>
        <strong>
          {formatCny(Math.abs(comparison.annualDifferenceCny), locale)}
        </strong>
        <span>
          {annualText}
          {first.billingPeriod !== "year"
            ? en
              ? " · annual estimate, not an annual-plan quote"
              : " · 一年估算，非年付报价"
            : ""}
        </span>
      </div>
      <p className="comparison-note">
        {en
          ? "This estimates a price difference, not guaranteed savings. Taxes, eligibility, payment fees, future prices and FX may differ."
          : "这是价格差额估算。税费、购买资格、支付手续费、后续价格和汇率均可能不同。"}
        {comparison.differentFxDates
          ? en
            ? " The quotes use different FX dates."
            : "两条报价的汇率日期不同。"
          : ""}
      </p>
      <div className="comparison-actions">
        <button
          type="button"
          className="secondary-button pressable"
          onClick={() => void copyResult()}
        >
          <Copy size={15} aria-hidden="true" />
          {en ? "Copy result" : "复制比较结果"}
        </button>
        <a href={sharePath}>{en ? "Result link" : "结果链接"}</a>
        {onFollow ? (
          <button
            type="button"
            className="secondary-button pressable"
            onClick={onFollow}
          >
            {en ? "Follow this plan" : "关注本套餐变化"}
          </button>
        ) : null}
        <span role="status">
          {copyStatus === "copied"
            ? en
              ? "Copied"
              : "已复制"
            : copyStatus === "error"
              ? en
                ? "Copy unavailable. Use the result link."
                : "复制不可用，可使用结果链接。"
              : ""}
        </span>
      </div>
      <SubscriptionHistoryPanel
        key={provider.id}
        providerId={provider.id}
        planId={first.planId}
        regions={[first.regionCode!, second.regionCode!]}
        locale={locale}
      />
    </section>
  );
}
