import type { BillingPeriod, PriceOffer, PriceStatus } from "./types";
import type { Locale } from "@/lib/i18n";

export const API_INITIAL_VISIBLE_COUNT = 10;

const periodLabels: Record<Locale, Record<BillingPeriod, string>> = {
  "zh-CN": {
    week: "/周",
    month: "/月",
    quarter: "/季",
    year: "/年",
    one_time: "一次性",
    usage: "",
  },
  en: {
    week: "/week",
    month: "/month",
    quarter: "/quarter",
    year: "/year",
    one_time: "one-time",
    usage: "",
  },
};

function intlLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "zh-CN";
}

export function formatPeriod(
  period: BillingPeriod,
  locale: Locale = "zh-CN",
): string {
  return periodLabels[locale][period];
}

export function formatCny(value?: number, locale: Locale = "zh-CN"): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatApiCny(value?: number, locale: Locale = "zh-CN"): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatOfferPrice(
  offer: PriceOffer,
  locale: Locale = "zh-CN",
): string {
  if (offer.amountMinor === null || offer.currency === null) {
    return offer.displayPrice;
  }

  const period = formatPeriod(offer.billingPeriod, locale);
  if (!period || offer.displayPrice.trim().endsWith(period)) {
    return offer.displayPrice;
  }
  return `${offer.displayPrice}${period}`;
}

const zeroDecimalCurrencies = new Set(["CLP", "IDR", "JPY", "KRW", "VND"]);

export function formatFxRate(
  offer: PriceOffer,
  locale: Locale = "zh-CN",
): string {
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
    return locale === "en"
      ? `1 ${offer.currency} ≈ —`
      : `1 ${offer.currency} ≈ —`;
  }

  const maximumFractionDigits = rate >= 100 ? 2 : rate >= 0.01 ? 4 : 6;
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(rate);
  return `1 ${offer.currency} ≈ ¥${formatted}`;
}

export function formatFxDate(
  offer: PriceOffer,
  locale: Locale = "zh-CN",
): string {
  const date = offer.fxRateObservedAt?.slice(0, 10);
  if (date) return locale === "en" ? `FX date ${date}` : `汇率 ${date}`;
  return locale === "en" ? "FX date unknown" : "汇率日期未知";
}

/*
 * Keep these labels in this module for callers that do not render through a
 * page component yet. The optional locale keeps existing Chinese callers and
 * tests backwards compatible.
 */
export function statusLabel(
  status: PriceStatus,
  locale: Locale = "zh-CN",
): string {
  const labels: Record<Locale, Record<PriceStatus, string>> = {
    "zh-CN": {
      verified: "已核验",
      stale: "可能过期",
      pending: "等待采集",
      unpublished: "未公开固定价",
    },
    en: {
      verified: "Verified",
      stale: "Potentially stale",
      pending: "Pending collection",
      unpublished: "No public fixed price",
    },
  };

  return labels[locale][status];
}

/* The following helpers are data-shape operations and are locale agnostic. */

/*
 * Keep the old exports below this comment unchanged in behavior.
 */

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

export function visibleApiOffers(
  offers: PriceOffer[],
  expanded: boolean,
): PriceOffer[] {
  return expanded ? offers : offers.slice(0, API_INITIAL_VISIBLE_COUNT);
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
