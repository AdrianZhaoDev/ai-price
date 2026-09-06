import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChannelsPage } from "@/components/channels-page";
import * as repository from "@/lib/channels/repository";
import { channelOfferFiltersSchema } from "@/lib/channels/types";

vi.mock("@/components/site-header", () => ({
  SiteHeader: () => null,
  SiteFooter: () => null,
}));

describe("channel page search boundaries", () => {
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
