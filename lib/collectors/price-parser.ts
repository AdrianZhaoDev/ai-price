import type { NormalizedOffer } from "@/lib/collectors/types";

const zeroDecimalCurrencies = new Set(["CLP", "IDR", "JPY", "KRW", "VND"]);

export function currencyFractionDigits(currency: string): number {
  return zeroDecimalCurrencies.has(currency.toUpperCase()) ? 0 : 2;
}

export function parseLocalizedPrice(
  displayPrice: string,
  currency: string,
): number {
  const fractionDigits = currencyFractionDigits(currency);
  let numeric = displayPrice
    .replace(/\u00a0/g, " ")
    .replace(/[^\d.,]/g, "")
    .trim();

  if (!numeric) {
    throw new Error(`Cannot parse price: ${displayPrice}`);
  }

  const comma = numeric.lastIndexOf(",");
  const dot = numeric.lastIndexOf(".");
  const separator = Math.max(comma, dot);

  if (fractionDigits === 0) {
    numeric = numeric.replace(/[.,]/g, "");
  } else if (separator >= 0) {
    const digitsAfter = numeric.length - separator - 1;
    const integer = numeric.slice(0, separator).replace(/[.,]/g, "");
    if (
      (digitsAfter > 0 && digitsAfter <= fractionDigits) ||
      (Number(integer) === 0 && digitsAfter <= 6)
    ) {
      const fraction = numeric.slice(separator + 1);
      numeric = `${integer}.${fraction}`;
    } else {
      numeric = numeric.replace(/[.,]/g, "");
    }
  }

  const amount = Number(numeric);
  if (!Number.isFinite(amount)) {
    throw new Error(`Cannot parse price: ${displayPrice}`);
  }

  const magnitude = /ribu/i.test(displayPrice) ? 1000 : 1;
  return Number((amount * magnitude * 10 ** fractionDigits).toFixed(6));
}

export function inferBillingPeriod(
  planName: string,
): NormalizedOffer["billingPeriod"] {
  if (/week|weekly|周/i.test(planName)) return "week";
  if (/quarter|quarterly|季/i.test(planName)) return "quarter";
  if (/year|yearly|annual|年/i.test(planName)) return "year";
  if (/one.?time|lifetime|永久|一次/i.test(planName)) return "one_time";
  return "month";
}

export function slugifyPlan(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
}
