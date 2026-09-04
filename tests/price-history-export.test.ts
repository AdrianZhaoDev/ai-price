import { describe, expect, it } from "vitest";
import {
  renderPriceChangesCsv,
  renderPriceChangesRss,
} from "@/lib/pricing/history-export";
import type { SubscriptionPriceChange } from "@/lib/pricing/history-types";

const event: SubscriptionPriceChange = {
  id: "test-event",
  providerId: "chatgpt",
  providerName: "ChatGPT & example",
  planId: "plus-monthly",
  planName: "Plus <plan>",
  regionCode: "JP",
  regionName: "日本",
  currency: "JPY",
  previousAmountMinor: 3000,
  currentAmountMinor: 2900,
  previousDisplayPrice: "¥3,000",
  currentDisplayPrice: "¥2,900",
  billingPeriod: "month",
  confirmedAt: "2026-09-04T00:00:00.000Z",
  sourceUrl: "https://example.com/price?region=JP&plan=plus",
};

describe("public price history exports", () => {
  it("exports major-currency values and keeps CSV delimiters safe", () => {
    expect(renderPriceChangesCsv([event])).toContain('"JPY","3000","2900"');
    expect(renderPriceChangesCsv([{ ...event, currency: "USD" }])).toContain(
      '"USD","30","29"',
    );
    expect(
      renderPriceChangesCsv([{ ...event, planId: '=HYPERLINK("bad")' }]),
    ).toContain('"\'=HYPERLINK(""bad"")"');
  });
  it("produces parseable RSS with stable item identities and escaped source text", () => {
    const xml = renderPriceChangesRss([event]);
    const document = new DOMParser().parseFromString(xml, "application/xml");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelector("item title")?.textContent).toContain(
      "ChatGPT & example · Plus <plan>",
    );
    expect(document.querySelector("item guid")?.textContent).toBe(
      "https://lowpriceradar.com/price-changes#change-test-event",
    );
    expect(document.querySelector("item pubDate")?.textContent).toBe(
      "Fri, 04 Sep 2026 00:00:00 GMT",
    );
    expect(document.querySelector("item description")?.textContent).toContain(
      event.sourceUrl,
    );
  });
  it("returns a valid empty feed without inventing price changes", () => {
    const document = new DOMParser().parseFromString(
      renderPriceChangesRss([]),
      "application/xml",
    );
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelectorAll("item")).toHaveLength(0);
  });
});
