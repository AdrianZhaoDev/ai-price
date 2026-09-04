import { describe, expect, it } from "vitest";
import {
  compareSubscriptions,
  comparisonPath,
  isComparableSubscription,
} from "@/lib/pricing/comparison";
import type { PriceOffer } from "@/lib/pricing/types";

const first: PriceOffer = {
  id: "plus-us",
  planId: "plus-monthly",
  planName: "Plus",
  amountMinor: 1999,
  currency: "USD",
  displayPrice: "$19.99",
  billingPeriod: "month",
  regionCode: "US",
  convertedCny: 140,
  status: "verified",
  fxRateObservedAt: "2026-09-04T00:00:00Z",
};
const second: PriceOffer = {
  ...first,
  id: "plus-jp",
  regionCode: "JP",
  amountMinor: 3000,
  currency: "JPY",
  convertedCny: 120,
};

describe("subscription comparison", () => {
  it("compares stored CNY quotes without assuming two decimal places for JPY", () => {
    expect(compareSubscriptions(first, second)).toMatchObject({
      differenceCny: -20,
      annualDifferenceCny: -240,
      firstAnnualCny: 1680,
      secondAnnualCny: 1440,
      paymentsPerYear: 12,
    });
  });
  it("does not multiply annual-plan prices by twelve", () => {
    expect(
      compareSubscriptions(
        { ...first, billingPeriod: "year" },
        { ...second, billingPeriod: "year" },
      ),
    ).toMatchObject({ annualDifferenceCny: -20, paymentsPerYear: 1 });
  });
  it("rejects different plans, periods, same regions and unverified or nonfinite prices", () => {
    for (const offer of [
      { ...second, planId: "pro-monthly" },
      { ...second, billingPeriod: "year" as const },
      { ...second, regionCode: "US" },
      { ...second, status: "pending" as const },
      { ...second, convertedCny: NaN },
      { ...second, convertedCny: -1 },
    ]) {
      expect(compareSubscriptions(first, offer)).toBeNull();
    }
    expect(isComparableSubscription({ ...first, billingPeriod: "usage" })).toBe(
      false,
    );
  });
  it("retains delayed quotes with an explicit freshness signal", () => {
    expect(
      compareSubscriptions(first, {
        ...second,
        status: "stale",
        fxRateObservedAt: "2026-08-31T00:00:00Z",
      }),
    ).toMatchObject({ hasStaleQuote: true, differentFxDates: true });
  });
  it("shares only a product, plan and two region codes", () => {
    expect(
      comparisonPath({
        locale: "en",
        providerId: "chatgpt",
        planId: "plus-monthly",
        firstRegion: "US",
        secondRegion: "JP",
      }),
    ).toBe("/en?provider=chatgpt&plan=plus-monthly#compare?from=US&to=JP");
  });
});
