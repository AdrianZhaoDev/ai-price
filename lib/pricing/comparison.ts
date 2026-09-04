import type { PriceOffer } from "./types";

export function isComparableSubscription(offer: PriceOffer): boolean {
  return (
    Boolean(offer.regionCode && offer.currency) &&
    offer.amountMinor !== null &&
    Number.isFinite(offer.amountMinor) &&
    offer.amountMinor >= 0 &&
    offer.convertedCny !== undefined &&
    Number.isFinite(offer.convertedCny) &&
    offer.convertedCny >= 0 &&
    (offer.status === "verified" || offer.status === "stale") &&
    ["month", "quarter", "year"].includes(offer.billingPeriod)
  );
}

export function compareSubscriptions(first: PriceOffer, second: PriceOffer) {
  if (
    !isComparableSubscription(first) ||
    !isComparableSubscription(second) ||
    first.planId !== second.planId ||
    first.billingPeriod !== second.billingPeriod ||
    first.regionCode === second.regionCode
  )
    return null;

  const paymentsPerYear =
    first.billingPeriod === "month"
      ? 12
      : first.billingPeriod === "quarter"
        ? 4
        : 1;
  const differenceCny = second.convertedCny! - first.convertedCny!;
  return {
    differenceCny,
    annualDifferenceCny: differenceCny * paymentsPerYear,
    firstAnnualCny: first.convertedCny! * paymentsPerYear,
    secondAnnualCny: second.convertedCny! * paymentsPerYear,
    paymentsPerYear,
    hasStaleQuote: first.status === "stale" || second.status === "stale",
    differentFxDates: first.fxRateObservedAt !== second.fxRateObservedAt,
  };
}

export function comparisonPath(input: {
  locale: "en" | "zh-CN";
  providerId: string;
  planId: string;
  firstRegion: string;
  secondRegion: string;
}): string {
  const query = new URLSearchParams({
    provider: input.providerId,
    plan: input.planId,
  });
  const selection = new URLSearchParams({
    from: input.firstRegion,
    to: input.secondRegion,
  });
  return `${input.locale === "en" ? "/en" : "/"}?${query}#compare?${selection}`;
}
