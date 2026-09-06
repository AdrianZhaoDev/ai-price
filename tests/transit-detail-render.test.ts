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
