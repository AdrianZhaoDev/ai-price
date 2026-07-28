import { describe, expect, it } from "vitest";
import {
  currencyFractionDigits,
  inferBillingPeriod,
  parseLocalizedPrice,
  slugifyPlan,
} from "@/lib/collectors/price-parser";

describe("localized price parser", () => {
  it("parses decimal, comma and zero-decimal currencies", () => {
    expect(parseLocalizedPrice("$19.99", "USD")).toBe(1999);
    expect(parseLocalizedPrice("22,99 €", "EUR")).toBe(2299);
    expect(parseLocalizedPrice("$1,299.00", "USD")).toBe(129900);
    expect(parseLocalizedPrice("$1,000", "USD")).toBe(100000);
    expect(parseLocalizedPrice("₩29,000", "KRW")).toBe(29000);
    expect(parseLocalizedPrice("$ 99.900,00", "COP")).toBe(9990000);
    expect(parseLocalizedPrice("$690.00", "TWD")).toBe(69000);
    expect(parseLocalizedPrice("¥2.4", "CNY")).toBe(240);
    expect(parseLocalizedPrice("¥39.9", "CNY")).toBe(3990);
    expect(parseLocalizedPrice("¥0.025", "CNY")).toBe(2.5);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("USD")).toBe(2);
  });

  it("rejects values without a number", () => {
    expect(() => parseLocalizedPrice("not available", "USD")).toThrow();
  });

  it("infers periods and stable slugs", () => {
    expect(inferBillingPeriod("Weekly plan")).toBe("week");
    expect(inferBillingPeriod("季度套餐")).toBe("quarter");
    expect(inferBillingPeriod("Annual plan")).toBe("year");
    expect(inferBillingPeriod("Lifetime")).toBe("one_time");
    expect(inferBillingPeriod("年卡")).toBe("year");
    expect(inferBillingPeriod("Pro")).toBe("month");
    expect(slugifyPlan("Claude Max 20×")).toBe("claude-max-20");
  });
});
