import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";
import { ApiTransitDetailPage } from "@/components/api-transit-detail-page";
vi.mock("@/components/site-header", () => ({
  SiteHeader: () => null,
  SiteFooter: () => null,
}));

describe("transit detail rendering", () => {
  it.each(["en", "zh-CN"] as const)(
    "renders evidence source, scope and UTC time alongside rates in %s",
    (locale) => {
      const station = getSyntheticTransitStations()[0];
      station.availability = {
        ...station.availability,
        sevenDaySamples: 10,
        sevenDayRate: 0.8,
        sourceType: "merchant_reported",
        sourceLabel: "Operator heartbeat",
        sourceUrl: "https://example.com/status",
        scope: "station",
        matchLevel: "station",
        lastCheckedAt: "2026-09-06T01:00:00Z",
      };
      station.offers = [
        {
          ...station.offers[0],
          availability: {
            ...station.availability,
            sourceType: "authorized_probe",
            sourceLabel: "Exact model probe",
            scope: "offer",
            matchLevel: "exact",
          },
        },
      ];
      const page = new DOMParser().parseFromString(
        renderToStaticMarkup(
          createElement(ApiTransitDetailPage, {
            locale,
            station,
            degraded: false,
          }),
        ),
        "text/html",
      );
      const evidence = [
        ...page.querySelectorAll("[data-availability-evidence]"),
      ];
      expect(evidence).toHaveLength(2);
      expect(evidence[0].textContent).toContain(
        locale === "en" ? "Merchant reported" : "商家自报",
      );
      expect(evidence[1].textContent).toContain(
        locale === "en" ? "This offer" : "该报价",
      );
      expect(evidence[1].textContent).toContain("Exact model probe");
      expect(evidence[1].querySelector("time")?.dateTime).toBe(
        "2026-09-06T01:00:00.000Z",
      );
      expect(evidence[1].querySelector("a")?.href).toBe(
        "https://example.com/status",
      );
    },
  );
  it.each([0, 0.1, 1])(
    "does not turn sample presence into a health endorsement at rate %s",
    (sevenDayRate) => {
      const station = getSyntheticTransitStations()[0];
      station.offers = [
        {
          ...station.offers[0],
          availability: {
            ...station.offers[0].availability,
            sevenDaySamples: 10,
            sevenDayRate,
          },
        },
      ];
      const page = new DOMParser().parseFromString(
        renderToStaticMarkup(
          createElement(ApiTransitDetailPage, {
            locale: "en",
            station,
            degraded: false,
          }),
        ),
        "text/html",
      );
      const pill = [...page.querySelectorAll("span")].find((item) =>
        item.textContent?.includes("(10 samples)"),
      );
      expect(pill).toBeTruthy();
      expect(pill?.getAttribute("data-tone")).toBe(
        sevenDayRate === 0 ? "warning" : null,
      );
    },
  );
  it.each(["zh-CN", "en"] as const)(
    "renders supplied pricing and degradation evidence in %s without reading a repository",
    (locale) => {
      const stations = getSyntheticTransitStations();
      const station = stations[0];
      station.synthetic = false;
      station.dataStatus = "verified";
      station.offers = [
        {
          ...station.offers[0],
          combinedRate: 1e-8,
          inputPrice: 1e-8,
          outputPrice: 2e-8,
        },
        {
          ...station.offers[0],
          id: "request",
          billingMode: "per_request",
          fixedPrice: 0.2,
          fixedPriceUnit: "request",
        },
        {
          ...station.offers[0],
          id: "fixed",
          billingMode: "fixed",
          fixedPrice: null,
          priceSourceLabel: null,
          priceSourceUrl: null,
        },
      ];
      const html = renderToStaticMarkup(
        createElement(ApiTransitDetailPage, {
          locale,
          station,
          degraded: true,
        }),
      );
      expect(html).toContain("0.00000001×");
      expect(html).toContain("0.00000002");
      expect(html).toContain(locale === "en" ? "degraded" : "降级");
      const page = new DOMParser().parseFromString(html, "text/html");
      expect(
        page.querySelector('[role="status"]')?.getAttribute("data-tone"),
      ).toBe("warning");
      expect(page.querySelector('[role="status"] strong')?.textContent).toBe(
        locale === "en" ? "Stale or degraded data" : "数据过期或降级",
      );
      expect(html).toContain("nofollow noopener noreferrer");
      for (const example of stations) {
        expect(
          renderToStaticMarkup(
            createElement(ApiTransitDetailPage, {
              locale,
              station: example,
              degraded: false,
            }),
          ),
        ).toContain(example.name);
      }
      station.offers = [];
      station.synthetic = false;
      station.dataStatus = "pending_review";
      station.riskLabels = [];
      station.paymentMethods = [];
      const empty = renderToStaticMarkup(
        createElement(ApiTransitDetailPage, {
          locale,
          station,
          degraded: false,
        }),
      );
      expect(empty).toContain(
        locale === "en" ? "No public offers" : "暂无公开报价",
      );
      expect(empty).toContain(locale === "en" ? "Pending review" : "待审核");
    },
  );
});
