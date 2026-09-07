import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChannelsPage } from "@/components/channels-page";
import * as repository from "@/lib/channels/repository";
import { channelOfferFiltersSchema } from "@/lib/channels/types";
import { createSyntheticChannelSnapshot } from "@/lib/channels/fixture";

vi.mock("@/components/site-header", () => ({
  SiteHeader: () => null,
  SiteFooter: () => null,
}));

describe("channel page search boundaries", () => {
  it.each(["en", "zh-CN"] as const)(
    "paginates all three %s views and preserves filters",
    async (locale) => {
      const snapshot = createSyntheticChannelSnapshot();
      snapshot.offers = Array.from({ length: 55 }, (_, index) => ({
        ...snapshot.offers[0],
        id: `offer-${index}`,
        publicDedupeKey: `key-${index}`,
        productId: `product-${index}`,
        productName: `Product ${index}`,
        merchantId: `merchant-${index}`,
        merchantName: `Merchant ${index}`,
        priceMinor: index + 100,
      }));
      const local = repository.createChannelRepository();
      vi.spyOn(local, "load").mockResolvedValue(snapshot);
      const spy = vi
        .spyOn(repository, "getChannelList")
        .mockImplementation((input) => local.list(input));
      try {
        const page = await ChannelsPage({
          locale,
          searchParams: Promise.resolve({
            offset: "50",
            limit: "50",
            productOffset: "24",
            merchantOffset: "12",
            q: "Product",
            sort: "price",
          }),
        });
        const document = new DOMParser().parseFromString(
          renderToStaticMarkup(page),
          "text/html",
        );
        expect(
          document.querySelector('[aria-labelledby="channel-offers-title"]')
            ?.textContent,
        ).toContain("Product 50");
        expect(
          document.querySelector('[aria-labelledby="channel-offers-title"]')
            ?.textContent,
        ).not.toContain("Product 0");
        expect(
          document.querySelectorAll(
            '[aria-labelledby="channel-products-title"] article',
          ),
        ).toHaveLength(24);
        expect(
          document.querySelectorAll(
            '[aria-labelledby="channel-merchants-title"] article',
          ),
        ).toHaveLength(12);
        const links = [...document.querySelectorAll("nav a")];
        expect(links).toHaveLength(5);
        const queries = links.map(
          (link) =>
            new URL(link.getAttribute("href")!, "https://example.com")
              .searchParams,
        );
        expect(
          queries.every(
            (query) =>
              query.get("q") === "Product" && query.get("limit") === "50",
          ),
        ).toBe(true);
        expect(
          queries.some((query) => query.get("productOffset") === "48"),
        ).toBe(true);
        expect(
          queries.some((query) => query.get("merchantOffset") === "24"),
        ).toBe(true);
        expect(queries.some((query) => query.get("offset") === "0")).toBe(true);
      } finally {
        spy.mockRestore();
      }
    },
  );
  it.each(["q", "search"])(
    "bounds %s without discarding other filters",
    async (key) => {
      const local = repository.createChannelRepository();
      const spy = vi
        .spyOn(repository, "getChannelList")
        .mockImplementation(async (input) => {
          expect(channelOfferFiltersSchema.parse(input)).toMatchObject({
            query: "x".repeat(120),
            availability: "unknown",
            sort: "updated",
            direction: "desc",
          });
          return local.list(input);
        });
      try {
        const page = await ChannelsPage({
          locale: "en",
          searchParams: Promise.resolve({
            [key]: "x".repeat(121),
            availability: "unknown",
            sort: "updated",
          }),
        });
        const document = new DOMParser().parseFromString(
          renderToStaticMarkup(page),
          "text/html",
        );
        const input =
          document.querySelector<HTMLInputElement>("#channel-query");
        expect(input?.getAttribute("value")).toBe("x".repeat(120));
        expect(input?.getAttribute("maxLength")).toBe("120");
        expect(spy).toHaveBeenCalledOnce();
      } finally {
        spy.mockRestore();
      }
    },
  );
});
