import { describe, expect, it } from "vitest";
import { convertMinorToCny, type FxRate } from "@/lib/collectors/fx";

function rate(currency: string, cnyPerUnit: number): FxRate {
  return {
    currency,
    cnyPerUnit,
    rateDate: "2026-07-24",
    observedAt: new Date("2026-07-24T00:00:00Z"),
    sourceUrl: "https://api.frankfurter.dev/v2/rates",
  };
}

describe("RMB conversion", () => {
  it("respects decimal and zero-decimal currencies", () => {
    expect(convertMinorToCny(1999, "USD", rate("USD", 6.8))).toBe(135.932);
    expect(convertMinorToCny(3000, "JPY", rate("JPY", 0.045))).toBe(135);
    expect(convertMinorToCny(4900, "CNY", rate("CNY", 1))).toBe(49);
  });

  it("keeps unavailable offers null and rejects missing rates", () => {
    expect(convertMinorToCny(null, "USD", undefined)).toBeNull();
    expect(() => convertMinorToCny(100, "USD", undefined)).toThrow(
      "Missing RMB exchange rate",
    );
  });
});
