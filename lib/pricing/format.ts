import type { BillingPeriod, PriceOffer, PriceStatus } from "./types";

const periodLabels: Record<BillingPeriod, string> = {
  week: "/周",
  month: "/月",
  quarter: "/季",
  year: "/年",
  one_time: "一次性",
  usage: "",
};

export function formatPeriod(period: BillingPeriod): string {
  return periodLabels[period];
}

export function formatCny(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatOfferPrice(offer: PriceOffer): string {
  if (offer.amountMinor === null || offer.currency === null) {
    return offer.displayPrice;
  }

  const period = formatPeriod(offer.billingPeriod);
  if (!period || offer.displayPrice.trim().endsWith(period)) {
    return offer.displayPrice;
  }
  return `${offer.displayPrice}${period}`;
}

const zeroDecimalCurrencies = new Set(["CLP", "IDR", "JPY", "KRW", "VND"]);

export function formatFxRate(offer: PriceOffer): string {
  if (!offer.currency) return "—";

  const fractionDigits = zeroDecimalCurrencies.has(offer.currency.toUpperCase())
    ? 0
    : 2;
  const originalAmount =
    offer.amountMinor === null
      ? undefined
      : offer.amountMinor / 10 ** fractionDigits;
  const rate =
    offer.fxRate ??
    (offer.convertedCny !== undefined &&
    originalAmount !== undefined &&
    originalAmount > 0
      ? offer.convertedCny / originalAmount
      : undefined);

  if (rate === undefined || !Number.isFinite(rate)) {
    return `1 ${offer.currency} ≈ —`;
  }

  const maximumFractionDigits = rate >= 100 ? 2 : rate >= 0.01 ? 4 : 6;
  const formatted = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(rate);
  return `1 ${offer.currency} ≈ ¥${formatted}`;
}

export function compareCnyPrice(
  value?: number,
  minimum?: number,
): { isMinimum: boolean; difference: number; percentage: number } | undefined {
  if (
    value === undefined ||
    minimum === undefined ||
    !Number.isFinite(value) ||
    !Number.isFinite(minimum) ||
    minimum <= 0
  ) {
    return undefined;
  }

  const difference = Number(Math.max(0, value - minimum).toFixed(6));
  return {
    isMinimum: difference < 0.005,
    difference,
    percentage: (difference / minimum) * 100,
  };
}

export function statusLabel(status: PriceStatus): string {
  const labels: Record<PriceStatus, string> = {
    verified: "已核验",
    stale: "可能过期",
    pending: "等待采集",
    unpublished: "未公开固定价",
  };

  return labels[status];
}

export function isComparableOffer(offer: PriceOffer): boolean {
  return (
    offer.status === "verified" &&
    offer.amountMinor !== null &&
    offer.currency !== null
  );
}

export function lowestComparableOffer(
  offers: PriceOffer[],
): PriceOffer | undefined {
  return offers
    .filter(
      (offer) => isComparableOffer(offer) && offer.convertedCny !== undefined,
    )
    .sort((a, b) => (a.convertedCny ?? 0) - (b.convertedCny ?? 0))[0];
}

export function displayableOffers(offers: PriceOffer[]): PriceOffer[] {
  const monthlyNames = new Set(
    offers
      .filter(
        (offer) =>
          offer.billingPeriod === "month" &&
          offer.amountMinor !== null &&
          !offer.planId.endsWith("-availability"),
      )
      .map((offer) => offer.planName.trim().toLocaleLowerCase()),
  );
  return offers.filter(
    (offer) =>
      offer.amountMinor !== null &&
      !offer.planId.endsWith("-availability") &&
      !(
        offer.billingPeriod === "year" &&
        monthlyNames.has(offer.planName.trim().toLocaleLowerCase())
      ),
  );
}

export function sortOffersByCny(
  offers: PriceOffer[],
  direction: "asc" | "desc",
): PriceOffer[] {
  return [...offers].sort((a, b) => {
    const aValue = a.convertedCny;
    const bValue = b.convertedCny;
    if (aValue === undefined && bValue === undefined) {
      return a.planName.localeCompare(b.planName, "zh-CN");
    }
    if (aValue === undefined) return 1;
    if (bValue === undefined) return -1;
    return direction === "asc" ? aValue - bValue : bValue - aValue;
  });
}

export function plansByMinimumPrice(
  offers: PriceOffer[],
  direction: "asc" | "desc" = "asc",
): Array<{ id: string; name: string; minimumCny?: number }> {
  const plans = new Map<
    string,
    { id: string; name: string; minimumCny?: number }
  >();

  for (const offer of offers) {
    const current = plans.get(offer.planId) ?? {
      id: offer.planId,
      name: offer.planName,
    };
    if (
      offer.convertedCny !== undefined &&
      Number.isFinite(offer.convertedCny) &&
      (current.minimumCny === undefined ||
        offer.convertedCny < current.minimumCny)
    ) {
      current.minimumCny = offer.convertedCny;
    }
    plans.set(offer.planId, current);
  }

  return [...plans.values()].sort((a, b) => {
    if (a.minimumCny === undefined && b.minimumCny === undefined) {
      return a.name.localeCompare(b.name, "zh-CN");
    }
    if (a.minimumCny === undefined) return 1;
    if (b.minimumCny === undefined) return -1;
    return direction === "asc"
      ? a.minimumCny - b.minimumCny
      : b.minimumCny - a.minimumCny;
  });
}

export function lowestThreeRanks(offers: PriceOffer[]): Map<string, number> {
  const ranked = sortOffersByCny(
    offers.filter(
      (offer) => isComparableOffer(offer) && offer.convertedCny !== undefined,
    ),
    "asc",
  ).slice(0, 3);
  return new Map(ranked.map((offer, index) => [offer.id, index + 1]));
}
